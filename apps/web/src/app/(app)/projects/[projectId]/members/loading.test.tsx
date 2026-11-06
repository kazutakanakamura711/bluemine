import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ProjectMemberLoading from './loading';

describe('ProjectMemberLoading', () => {
  it('読み込み中の案内を伝え、装飾用のヘッダーや操作を公開しない', () => {
    render(<ProjectMemberLoading />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'プロジェクトメンバーを読み込んでいます。',
    );
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
