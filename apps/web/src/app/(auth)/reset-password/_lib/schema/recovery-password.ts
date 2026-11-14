import z from 'zod';

// 再設定リンクを検証する前に、フォームと再設定処理で使う入力条件。
// パスワードの前後の空白も入力の一部なので、trim はしない。
export const recoveryPasswordSchema = z
  .object({
    password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
    passwordConfirm: z.string().min(1, 'パスワード（確認）を入力してください'),
  })
  .refine((values) => values.password === values.passwordConfirm, {
    message: 'パスワードとパスワード（確認）が一致しません',
    path: ['passwordConfirm'],
  });

export type RecoveryPasswordValues = z.infer<typeof recoveryPasswordSchema>;
