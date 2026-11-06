// API のエラーレスポンスから、画面に表示できる message を安全に取り出す。
// エラー本文は外部から受け取る unknown な値なので、message が文字列の場合だけ返す。
// 取得できなければ undefined を返し、呼び出し側で操作ごとの汎用メッセージを表示する。
export function getErrorMessage(errorBody: unknown): string | undefined {
  if (
    typeof errorBody !== 'object' ||
    errorBody === null ||
    !('message' in errorBody) ||
    typeof errorBody.message !== 'string'
  ) {
    return undefined;
  }

  return errorBody.message;
}

// プロジェクト API が返す業務エラーを、画面側で statusCode とともに扱うためのエラー型。
// 作成・更新・アーカイブで共通して使い、画面ごとの表示方法だけを呼び出し側で分ける。
export class ProjectRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}
