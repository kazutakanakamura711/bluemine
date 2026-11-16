import { describe, expect, it } from 'vitest';

import { recoveryPasswordSchema } from './recovery-password';

describe('再設定するパスワードの入力検証', () => {
  it.each(['', '1234567'])(
    '8文字未満のパスワード「%s」を拒否する',
    (password) => {
      const result = recoveryPasswordSchema.safeParse({
        password,
        passwordConfirm: password,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['password'],
          message: 'パスワードは8文字以上で入力してください',
        }),
      );
    },
  );

  it.each(['12345678', '123456789', ' secret '])(
    '8文字以上で一致するパスワード「%s」を変更せず受け付ける',
    (password) => {
      const values = { password, passwordConfirm: password };

      expect(recoveryPasswordSchema.safeParse(values)).toEqual({
        success: true,
        data: values,
      });
    },
  );

  it('確認用パスワードが空なら、確認用の入力を求める', () => {
    const result = recoveryPasswordSchema.safeParse({
      password: '12345678',
      passwordConfirm: '',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        path: ['passwordConfirm'],
        message: 'パスワード（確認）を入力してください',
      }),
    );
  });

  it.each(['abcdefgh', ' 12345678', '12345678 '])(
    '空白の違いも含め、一致しない確認用パスワード「%s」を拒否する',
    (passwordConfirm) => {
      const result = recoveryPasswordSchema.safeParse({
        password: '12345678',
        passwordConfirm,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['passwordConfirm'],
          message: 'パスワードとパスワード（確認）が一致しません',
        }),
      );
    },
  );
});
