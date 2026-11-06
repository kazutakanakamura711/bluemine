# Web app rules

- `page.tsx` と `layout.tsx` は Server Component を基本にする。state、event handler、browser API が必要な末端だけを Client Component にする。
- route 専用コードは route 配下の `_components` / `_lib`、複数画面で使う業務 UI は `features`、汎用 UI は `components/ui` / `components/common` に置く。
- shadcn/ui を優先し、独自 primitive を目的なく増やさない。
- Form には label、入力エラー、disabled 状態を用意する。非同期画面には loading、empty、error を用意する。
- 再利用 UI と状態分岐の多い UI は Storybook の story を追加する。
- Desktop と mobile の両方を確認し、横幅が狭い時に table が読めなくならないようにする。
- UI 操作は Vitest + React Testing Library で、主要なユーザー導線は Playwright で検証する。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
