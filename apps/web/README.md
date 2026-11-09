# Web

Next.js App Router によるフロントエンドです。

## 開発

Next.js は `apps/web` の `.env*` を読みます。初回は、リポジトリのルートで次を実行し、
`apps/web/.env.local` にローカルの設定を記入します。既存の `.env.local` がある場合は上書きせず、
不足する変数だけを追加してください。

```bash
cp apps/web/.env.example apps/web/.env.local
```

| 環境変数                               | 設定する値                                                                |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL`             | NestJS の API URL。通常は `http://localhost:3001/api`                     |
| `NEXT_PUBLIC_SUPABASE_URL`             | API と同じ Supabase の Project URL。ローカルでは `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | API と同じ Supabase の Publishable key                                    |

ローカル Supabase の準備とキーの確認方法は [API README](../api/README.md#ローカル-supabase-auth) を参照してください。
`NEXT_PUBLIC_*` はブラウザにも渡るため、Secret key を設定しないでください。
実際のキーを含む `.env.local` は Git 管理外です。設定変更後は Web の開発サーバーを再起動します。

リポジトリのルートで次を実行します。

```bash
pnpm dev:web
```

ブラウザで `http://localhost:3000` を開きます。

## Storybook

再利用UIの状態は、リポジトリのルートで `pnpm storybook` を実行し、
`http://127.0.0.1:6006` で確認します。終了は `Ctrl+C`、静的buildは `pnpm storybook:build` です。
汎用UI・タスク一覧・作成／編集フォームなどの表示例を用意しています。設定と確認手順は
[Storybookの手順書](../../docs/STORYBOOK_SETUP_GUIDE.md)を参照してください。

## Web の認証基盤

`@supabase/supabase-js` と `@supabase/ssr` を使い、セッションを Cookie に保存します。

| ファイル                           | 役割                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/lib/supabase/client.ts`       | Client Component で使うブラウザ用クライアント                                                   |
| `src/lib/supabase/server.ts`       | Server Component / Server Action / Route Handler で、そのリクエストの Cookie を使うクライアント |
| `src/lib/supabase/confirmation.ts` | メール確認だけに使う、Cookie を読み書きしないクライアント                                       |
| `src/lib/supabase/proxy.ts`        | セッションの確認・更新と、未ログイン時の Project 画面からログイン画面への移動を行う             |
| `src/proxy.ts`                     | Next.js がページ表示前に呼ぶ入口。画像・静的ファイルは対象外                                    |

Server Component はレスポンスの Cookie を書けないため、手前の Proxy で更新します。
SDK が更新時に渡すキャッシュ制御ヘッダーもレスポンスへ反映します。
サーバー用クライアントはリクエストごとに作り、ユーザー間でセッションを共有しません。

`/login` でメールアドレス・パスワードによるログインを行い、NestJS の `/api/auth/me` で本人取得が成功するとプロジェクト一覧へ移動します。
Project の一覧・詳細はサーバー用クライアント、作成・更新・アーカイブ・解除はブラウザ用クライアントからセッションを取得し、全 6 API に Bearer token を付けます。
`getSession()` は token を取り出すために使い、本人確認には `getClaims()` / `getUser()` を使います。
NestJS 側でも受け取った Bearer token を検証します。

`/register` で名前・メールアドレス・パスワードを登録します。確認用パスワードは画面内で一致を検証し、Supabase には送りません。
名前は Supabase Auth の `user_metadata.name` に保存し、認証済み API の共通 AuthGuard を通る際にアプリ側 User の `name` へ同期します。
確認メールのリンクは `/confirm?token_hash=...&type=email` です。
`src/app/(auth)/confirm/route.ts` が確認専用クライアントの `verifyOtp()` で検証します。
確認時に発行されたセッションは Cookie に保存せず、既存のログイン状態を維持したまま `/login?confirmation=success` へ移動します。
確認したアカウントを利用するには、メールアドレスとパスワードでログインします。
検証エラーでは `/login?error=confirmation_failed` へ移動し、ログイン画面に固定の案内を表示します。
確認情報の不足や `type` の不正は、Supabase を呼ばず `400` を返します。

未ログインで `/projects` またはその配下を開くと、Proxy が `/login` へリダイレクトします。
ログイン画面はこのリダイレクトの対象外なので、移動を繰り返しません。
SDK が更新した Cookie とキャッシュ制御ヘッダーをリダイレクトにも引き継ぎます。

`src/app/(app)/layout.tsx` の `ProjectsNavigationContainer` は Cookie のセッションから token を取り出し、
`src/lib/auth/get-current-user.ts` の `getCurrentUser()` で `/api/auth/me` を呼びます。
ナビゲーション用の Project 一覧と本人情報を並行して取得し、同じ `navigationProps` を `ProjectsSidebar` と `AppHeader` に渡します。
各コンポーネントから名前とメールアドレスを `UserMenu` に props で渡します。
名前が `null` の場合は「ユーザー」と表示し、token 自体は表示用 props に渡しません。
共通の取得処理を `Suspense` で囲み、取得中はサイドバーとヘッダーの fallback で表示領域を確保します。

サイドバーと狭い画面の Sheet 内のユーザーメニューからログアウトできます。
`LogoutButton` が `signOut({ scope: 'local' })` で現在のセッションを終了し、
Cookie の更新を SDK に任せて `/login` へ移動・画面情報を更新します。
処理中は二重操作を防ぎ、失敗時は固定のエラーを表示して再試行できます。
ログアウト後に `/projects` を開くと、未ログイン時と同じく `/login` へ移動します。

`lg`（64rem / 通常1024px）以上はサイドバー、`lg` 未満は高さ48pxの `AppHeader` を表示します。
ヘッダーにはハンバーガーメニュー、ロゴと `Bluemine`、名前の先頭文字のアイコンを配置します。
右のアイコンには操作を持たせず、ハンバーガーメニューから shadcn/ui の Sheet を開きます。
Sheet では現在の項目を青色にし、リンク選択時に閉じます。リストだけをスクロール可能にして、`UserMenu` を最下部に置きます。
Sheet は `keepMounted` でログアウトの処理中状態・エラーを保持し、閉じる際や PC 幅への切り替え時は小メニューも閉じます。
認証の構成と処理の責務は [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#web-の認証基盤) を参照してください。

### ローカルの確認メール

`supabase/config.toml` の `[auth.email].enable_confirmations` は `true` にしています。
`[auth.email.template.confirmation]` で `supabase/templates/confirmation.html` を指定し、
`SiteURL` と `TokenHash` を Supabase が埋め込んだメールを送ります。
設定を変更したときは、リポジトリのルートでローカル Supabase を再起動します。

```bash
pnpm exec supabase stop
pnpm exec supabase start
```

確認メールは [Mailpit](http://localhost:54324) で確認します。実在するメールアドレスは不要です。
[Supabase Studio](http://localhost:54323) の Authentication / Users では、ユーザーの確認済み状態を確認できます。
設定変更は新しく送るメールに反映されるため、未登録の検証用メールアドレスで登録から確認します。
クラウド環境では Supabase Dashboard の Email Templates と URL Configuration を別途設定します。

SDK の使い方は [Supabase SSR ガイド](https://supabase.com/docs/guides/auth/server-side/creating-a-client) を参照してください。

## 確認コマンド

CI の `quality` job は、build step に Supabase の URL と Publishable key のビルド確認用の値を設定します。
この job は Supabase へ接続せず、この設定で作った成果物はデプロイには使いません。
実際の認証を確認する `api_e2e` job は、CI 上で起動したローカル Supabase の設定を使います。
デプロイする Web の build では、接続先の環境に対応した公開設定を用意してください。

```bash
pnpm --filter @bluemine/web typecheck
pnpm --filter @bluemine/web lint
pnpm --filter @bluemine/web test
```
