// NEXT_PUBLIC_* はブラウザのコードにも埋め込まれるため、公開用の設定だけを読む。
export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY を設定してください。',
    );
  }

  return { url, publishableKey };
}
