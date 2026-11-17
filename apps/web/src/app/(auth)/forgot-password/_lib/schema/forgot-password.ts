import { z } from 'zod';

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'メールアドレスを入力してください')
    .pipe(z.email({ error: '有効なメールアドレスを入力してください' })),
});

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
