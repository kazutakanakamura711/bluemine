---
name: verify-change
description: 完了した Bluemine の変更に対し、影響に見合う確認を選んで実行する。Docker と Prisma に影響がある場合はそれらも確認する。
---

# 変更を検証する

変更ファイルと受け入れ条件から影響範囲を判断する。まず対象を絞り、リスクがある場合だけ確認範囲を広げる。

- TypeScript または設定: format check、影響する lint、typecheck
- Backend API: 影響する Vitest。REST、Prisma、認証、transaction にまたがる場合は結合テストを追加する
- Frontend の振る舞い: 影響する Vitest / React Testing Library。再利用 UI を変更した場合は Storybook を build する
- Browser/API の導線: 固定 sleep を使わない関連 Playwright spec
- Prisma schema または migration: client を生成し、PostgreSQL に migration を適用・確認してから、影響する API テストを実行する
- Docker ファイル: `docker compose config --quiet` と関連する service の healthcheck
- フェーズの確認: format、lint、typecheck、unit/integration test、build、Storybook build、関連する E2E

失敗したコマンドを同じ条件で繰り返さない。実行した各コマンドと結果、理由を添えた未実行の確認、残るリスクを報告する。実行していない確認を成功として扱わない。
