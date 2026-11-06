import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createClient,
  type SupabaseClient,
  type User as SupabaseUser,
} from '@supabase/supabase-js';
import { AuthRepository } from './auth.repository.js';

@Injectable()
export class AuthService {
  private readonly supabase: SupabaseClient;

  // NestJS が Repository を渡し、認証後のアプリ側 User の保存に使う。
  constructor(private readonly authRepository: AuthRepository) {
    // API が起動した時点で接続先と公開用キーの設定漏れを検出する。
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase Auth の設定がありません。');
    }

    // API はリクエストごとの token を検証するため、サーバー内にログイン状態を保持しない。
    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false, // NestJS はリクエストで受け取った token を検証するだけで、更新用 token を管理しない
        persistSession: false, // 複数ユーザーのリクエストを扱う API サーバーに、特定ユーザーのログイン状態を保存しない
        detectSessionInUrl: false, // この NestJS API はログイン後の画面遷移を扱わない
      },
    });
  }

  async verifyAccessToken(token: string): Promise<SupabaseUser> {
    // Supabase Auth に token を渡し、有効なら対応するユーザーを取得する。
    const { data, error } = await this.supabase.auth.getUser(token);

    // Supabase Auth がユーザーを返せなければ、token を受け入れず HTTP 401 にする。
    if (error || !data.user) {
      throw new UnauthorizedException('有効な access token が必要です。');
    }

    return data.user;
  }

  async getMe(token: string) {
    // まず Supabase Auth で本人を確認する。DB には検証済みの ID だけを渡す。
    const authUser = await this.verifyAccessToken(token);

    // アプリ側の User.email は必須なので、未確認・未設定のメールでは作成しない。
    if (!authUser.email || !authUser.email_confirmed_at) {
      throw new ForbiddenException('確認済みのメールアドレスが必要です。');
    }

    const metadataName = authUser.user_metadata.name;
    // 名前が文字列なら前後の空白を除き、未設定・空文字なら null にする。
    const name =
      typeof metadataName === 'string' ? metadataName.trim() || null : null;

    // Supabase Auth の ID を主キーにして、アプリ側の User を作成または更新する。
    return this.authRepository.upsertUser(authUser.id, authUser.email, name);
  }
}
