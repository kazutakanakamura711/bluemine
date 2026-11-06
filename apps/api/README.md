# API

NestJS による REST API です。

## 開発

以下のコマンドはすべてリポジトリのルートで実行します。Docker Desktop を起動し、
依存関係を `pnpm install --frozen-lockfile` でインストールしてください。

ルートの `.env` に [.env.example](../../.env.example) を参考に接続情報を設定します。
`.env` がない場合は `.env.example` をコピーして作成し、既存の `.env` は上書きしないでください。

名称変更前からローカル環境を使っている場合は、旧設定でコンテナを停止してから新しい設定へ切り替えてください。
Compose名・Supabaseの `project_id` ・DB名の変更によって保存先が切り替わり、既存データは自動移行されません。
必要なデータをバックアップしたうえで、`.env` のDB接続情報とSupabase起動後のキーを更新します。

### ローカル Supabase Auth

設定は [supabase/config.toml](../../supabase/config.toml) で管理しています。
このリポジトリでは初期化済みなので、`supabase init` を再実行する必要はありません。

初回のみ、公開ポートの既定の IPv4 アドレスを loopback にする Docker network を作成します。
`bluemine-local-network` を作成済みの場合は、このコマンドを省略してください。

```bash
docker network create \
  --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 \
  bluemine-local-network
```

Supabase を起動し、接続先とキーを確認します。

```bash
pnpm exec supabase start --network-id bluemine-local-network
pnpm exec supabase status
```

表示された値をルートの `.env` に設定します。

| 環境変数                   | 設定する値                                       | 使用箇所                                                |
| -------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| `SUPABASE_URL`             | Project URL（開発用は `http://127.0.0.1:54321`） | API と API E2E。テスト時は専用Supabaseを指定する        |
| `SUPABASE_PUBLISHABLE_KEY` | Authentication Keys の Publishable               | API の token 検証、Auth・Projects・Tasks E2E のログイン |
| `SUPABASE_SECRET_KEY`      | Authentication Keys の Secret                    | Auth・Projects・Tasks E2E のユーザー作成・削除          |

Secret key はテストの管理 API 用です。ブラウザ側や `NEXT_PUBLIC_*` に設定せず、
`.env` と実際のキーは Git に含めないでください。`status` の出力にもキーが含まれます。

Supabase の DB と、Prisma が接続するアプリ用 DB は別です。

| 用途                                         | ローカルの host port | 接続設定            |
| -------------------------------------------- | -------------------- | ------------------- |
| アプリの開発用 DB（Compose の `db`）         | 5432                 | `DATABASE_URL`      |
| アプリの E2E 専用 DB（Compose の `db-test`） | 5433                 | `TEST_DATABASE_URL` |
| Supabase 自身の DB                           | 54322                | Supabase CLI が管理 |

`status` に表示される Supabase の Database URL で `DATABASE_URL` を置き換えないでください。

作業終了時は次のコマンドで、このプロジェクトのローカル Supabase を停止できます。
通常の停止ではデータを保持します。

```bash
pnpm exec supabase stop
```

コマンドの仕様は [Supabase CLI の公式リファレンス](https://supabase.com/docs/reference/cli/introduction) を参照してください。

### アプリ用 DB と API の起動

開発用 PostgreSQL を起動し、migration と Prisma Client の生成後に API を起動します。

```bash
docker compose up -d db
pnpm --filter @bluemine/api exec prisma migrate dev
pnpm --filter @bluemine/api exec prisma generate
pnpm dev:api
```

起動確認には `GET http://localhost:3001/api/health` を使用します。

## 認証 API

`GET /api/auth/me` は、次のリクエストヘッダーで Supabase の access token を受け取ります。

```http
Authorization: Bearer <access_token>
```

API は `supabase.auth.getUser(token)` で本人を確認し、Supabase Auth のユーザー ID と
確認済みメールアドレスから、アプリ用 DB の `User` を取得・初回作成します。
作成・更新時にメールアドレスと `user_metadata.name` の名前を同期します。
名前が文字列なら前後の空白を除き、未設定・空白・文字列以外なら `null` にします。
既存の名前もこの値で更新するため、Supabase の名前が空白になるとアプリ側も `null` になります。
この同期は共通 AuthGuard を通る Project・Task API でも行います。名前は表示用で、認可判断には使いません。

| 条件                                                 | 応答                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| 有効な token と確認済みメールアドレス                | `200`。アプリ側の User（`id`、`email`、`name`、`createdAt`、`updatedAt`） |
| token なし、Bearer 形式の不備、無効な token          | `401`                                                                     |
| token は有効だが、メールアドレスが未設定または未確認 | `403`                                                                     |

Bruno でのテストユーザー作成、ログイン、token 保存、パスワード変更の手順は
[Bruno README](../../bruno/README.md) を参照してください。

### Swagger

[http://localhost:3001/api/docs](http://localhost:3001/api/docs) の Auth に、
`GET /api/auth/me` の概要、初回 User 作成の説明、User のレスポンスと `401`・`403` の条件を記載しています。
Projects の全 API にも Bearer 認証と `401`・`403` を設定し、Project のレスポンスには
作成者の UUID である `ownerId` を含めています。
詳細取得は `ProjectResponseDto` を継承した `ProjectDetailResponseDto` を使い、
本人の `currentUserRole` を owner・member・viewer の enum として説明しています。
設定更新・アーカイブ・解除の概要には owner のみと明記し、`403` はメール未設定・未確認と role の権限不足を説明しています。
詳細取得・設定更新・アーカイブ・解除の `404` は、Project が存在しない場合と非参加者の場合を説明しています。
メンバー一覧は参加者の owner・member・viewer に許可し、追加・role変更・削除は owner のみと明記しています。追加 API は email・role の入力 DTO、
member・viewer の enum、201の単一メンバー、400・401・403・404・409を説明しています。
role 変更 API は role のみの必須入力、ProjectMember ID のパラメーター、200の単一メンバー、
同じ role の成功、owner 保護・アーカイブ禁止、400・401・403・404・409を説明しています。
削除 API は ProjectMember ID の指定、本文なしの204、User・Supabase Auth アカウントの保持、
401・403・404・409、owner 保護・アーカイブ判定の優先を説明しています。
Tasks には一覧・詳細・作成・更新 API の Bearer 認証、Project ID、詳細・更新の Task ID、作成・更新入力、200・201の応答と400・401・403・404・409を記載しています。
`TaskResponseDto` は status・priority の enum、日付の `date`、日時の `date-time`、任意項目の nullable を説明します。
**Authorize** に Supabase の `access_token` の値だけを入力してから、**Try it out → Execute** で実行できます。
`Bearer` の接頭辞は Swagger が付けるため、入力に含めません。

Supabase のログイン・パスワード変更は別のサーバーが提供する API なので、
NestJS の Swagger には含めず、Bruno のリクエストと README に手順を記載しています。

## Project API の認証と owner 登録

次の全 API は共通の `AuthGuard` で保護し、Supabase の有効な Bearer token と
確認済みメールアドレスを必要とします。token なし・形式不正・無効な token は `401`、
メールアドレスが未設定・未確認の場合は `403` を返します。

| 操作             | メソッド・パス                                      | 成功時の応答                        |
| ---------------- | --------------------------------------------------- | ----------------------------------- |
| 一覧取得         | `GET /api/projects`                                 | `200`、Project の配列               |
| 詳細取得         | `GET /api/projects/:projectId`                      | `200`、Project と `currentUserRole` |
| 作成             | `POST /api/projects`                                | `201`、Project                      |
| 更新             | `PATCH /api/projects/:projectId`                    | `200`、Project                      |
| アーカイブ       | `POST /api/projects/:projectId/archive`             | `200`、Project                      |
| アーカイブ解除   | `POST /api/projects/:projectId/unarchive`           | `200`、Project                      |
| メンバー一覧     | `GET /api/projects/:projectId/members`              | `200`、メンバーの配列               |
| メンバー追加     | `POST /api/projects/:projectId/members`             | `201`、追加したメンバー             |
| メンバーrole変更 | `PATCH /api/projects/:projectId/members/:memberId`  | `200`、処理後のメンバー             |
| メンバー削除     | `DELETE /api/projects/:projectId/members/:memberId` | `204`、本文なし                     |

作成者の ID は `AuthGuard` が設定した `request.user.id` から取得します。
リクエスト本文に `ownerId` を指定する必要はありません。
Project の `ownerId` と、作成者の `ProjectMember`（`role: owner`）は同じ transaction で保存します。
Project のレスポンスには `ownerId` を含めます。

一覧取得は、本人が ProjectMember として参加している Project だけを返します。
owner・member・viewer のすべてを対象にし、作成日時の新しい順でアーカイブ済みも含めます。
参加 Project がなければ `200` と空配列を返します。
詳細取得も owner・member・viewer として参加している Project だけを許可します。
詳細レスポンスには、認証済み本人の対象 Project の ProjectMember.role を `currentUserRole` として追加します。
値は owner・member・viewer のいずれかで、アーカイブ済みでも返します。内部の `projectMembers` は公開しません。
この項目は詳細取得専用であり、一覧・作成・更新・アーカイブ・解除のレスポンスには追加しません。
Web は表示制御に使えますが、各 API での membership・role の検証も引き続き行います。
存在しない Project と非参加者には、同じメッセージ・本文の `404` を返します。
設定更新・アーカイブ・解除は owner のみ許可します。存在しない Project と非参加者には同じ `404`、
参加者である member・viewer には `403` を返します。
`ownerId` が本人でも、ProjectMember がなければ操作できません。
メンバー一覧も参加者の owner・member・viewer に許可し、追加・role変更・削除は owner のみ許可します。Web のメンバー一覧・追加 UI は実装済みで、作業ブランチでは権限変更 UI も行内編集から保存・一覧更新まで実装済みです。削除 UI は別の作業として扱います。

Next.js のログイン・登録画面と、Project の基本6 API 呼び出しへの token 付与は PR #21 で実装済みです。

### メンバー一覧・追加

`GET /api/projects/:projectId/members` は、対象 Project に参加する owner・member・viewer に、owner を含む全メンバーの一覧を返します。
アーカイブ済みでも閲覧でき、返却項目と並び順は閲覧者の role によって変わりません。
存在しない Project と非参加者には同じ404を返します。`ownerId` が本人でも、参加情報がなければ取得できません。
返却項目は `id`・`userId`・`role`・`createdAt`・`user.name`・`user.email` です。
並び順は owner を先頭にし、その他は role にかかわらず参加日時の古い順、同じ日時なら ProjectMember ID の昇順です。
member・viewer の権限変更や更新日時の変化だけでは、一覧の位置を変えません。
名前が未設定なら `null` を返します。

`POST /api/projects/:projectId/members` の入力例:

```json
{
  "email": "member@example.test",
  "role": "member"
}
```

email・role は必須です。email は前後の空白だけを除き、大文字・小文字を区別してアプリ側 User.email と完全一致で検索します。
role は member・viewer だけを受け付け、owner・manager は拒否します。null・型が不正な値・定義外の項目も400です。
実行者の ID は本文から受け取らず、AuthGuard が確認した `request.user.id` を使います。

追加対象はアプリ側 User が存在するユーザーだけです。Supabase Auth への登録だけでは、アプリ側 User は作成されません。
確認済みメールを持つ本人が、token を付けて `/api/auth/me` など AuthGuard を通る API を初めて呼ぶと作成されます。
メンバー追加 API で対象 User を作成・同期することはありません。

成功時は201と、メンバー一覧の各要素と同じ形式の単一オブジェクトを返します。
本文の検証後、実行者の membership・owner role、アーカイブ状態、追加対象 User の存在・参加状況を順に確認します。
保存時は Repository の transaction 内で、対象 Project 行を `SELECT … FOR UPDATE` によってロックし、状態を再確認してからメンバーを保存します。
Repository は作成成功・アーカイブ済み・Project 不在を結果として返し、Service がメンバーのレスポンス・409・404に変換します。
アーカイブが先に保存された場合は追加を409で拒否し、追加が先にロックを取得した場合は、メンバー保存までアーカイブが待機します。

| 条件                                        | 応答                  |
| ------------------------------------------- | --------------------- |
| 実行者が member・viewer                     | `403`                 |
| 存在しない Project、または実行者が非参加者  | 既存と同じ `404` 本文 |
| owner によるアーカイブ済み Project への追加 | `409`                 |
| 追加対象のアプリ側 User が見つからない      | `404`                 |
| owner 自身を含む、参加済みユーザーへの追加  | `409`                 |

重複は `(projectId, userId)` の unique 制約で防ぎ、同時追加による保存時の `P2002` も409に変換します。
既存の参加情報の role・値・更新日時は変更しません。
詳しいリクエスト・レスポンスとエラー本文は [UI_API.md](../../docs/UI_API.md) を参照してください。

### メンバーの role 変更

`PATCH /api/projects/:projectId/members/:memberId` は、owner が指定 Project 内の参加情報の role を変更する API です。
`memberId` にはメンバー一覧の `id`（ProjectMember.id）を使います。`userId` とは異なります。

```json
{
  "role": "viewer"
}
```

role は必須で、member・viewer のみです。owner・manager・null・型不正・空白付きや大文字の値・定義外の項目は400で拒否します。
成功時は200と、既存の `ProjectMemberResponseDto` による単一メンバーを返します。名前が未設定なら `null` です。
同じ role の指定も200とし、UPDATE を実行せず、Project・ProjectMember の値と更新日時を維持します。
実際の変更では、対象 ProjectMember の role・updatedAt だけを変更し、Project と他の参加情報、対象の ID・所属・参加日時を維持します。

認証 → DTO 検証 → 実行者の membership・owner 権限 → アーカイブ状態 → 対象の所属・存在・owner 保護 → 保存時の再確認の順に処理します。
実行者の ID は `request.user.id` を使い、対象の検索・更新は projectId と ProjectMember ID の両方で限定します。

| 条件                                                            | 応答                             |
| --------------------------------------------------------------- | -------------------------------- |
| 実行者が member・viewer                                         | `403`                            |
| 存在しない Project、または実行者が非参加者                      | 既存と同じ Project の `404` 本文 |
| アーカイブ済み Project（同じ role の指定も含む）                | `409`                            |
| 指定 Project 内に対象が存在しない、または別 Project の memberId | 同じ対象メンバーの `404` 本文    |
| 変更対象が owner                                                | `409`                            |

保存は transaction 内で Project 行を `SELECT … FOR UPDATE` によってロックしてから行います。
Repository は `project_not_found`・`project_archived`・`member_not_found`・`owner_protected`・`unchanged`・`updated` を返し、Service が例外またはメンバー情報に変換します。
Service で同じ role を事前に読んでも早期に成功を返さず、ロック取得後に最新の状態を確認します。
アーカイブが先に保存された場合は role 変更を409で拒否し、role 変更が先にロックを取った場合は保存完了までアーカイブが待機します。
同時 role 変更もロック取得順に処理し、後の処理は最新の role に対して指定を適用します。HTTP レスポンスの到着順は保証しません。
拒否時の Project・ProjectMember の値と更新日時も維持します。AuthGuard による User のプロフィール同期は比較に含めません。
エラー本文と判定順の詳細は [UI_API.md](../../docs/UI_API.md) を参照してください。

### メンバー削除

`DELETE /api/projects/:projectId/members/:memberId` は、owner が指定 Project 内の参加情報を1件削除する API です。
`memberId` は ProjectMember.id を指定し、リクエスト本文は使用しません。成功時は204・本文なしです。
削除対象の User と Supabase Auth アカウント、Project と他の参加情報の値・更新日時は保持します。

認証 → 実行者の membership・owner 権限 → アーカイブ状態 → 対象の所属・存在・owner 保護の順に確認します。
transaction 内で Project 行をロックし、Project の存在・アーカイブ状態と対象の所属・存在・owner 保護を再確認してから削除します。

| 条件                                                                                    | 応答                                       |
| --------------------------------------------------------------------------------------- | ------------------------------------------ |
| 実行者が member・viewer                                                                 | `403`                                      |
| 存在しない Project、または実行者が非参加者                                              | 同じ Project の `404` 本文                 |
| アーカイブ済み Project                                                                  | 対象の不存在・owner 保護より優先して `409` |
| 指定 Project 内に対象が存在しない、別 Project の memberId、User.id、削除済みの memberId | 同じ対象メンバーの `404` 本文              |
| 削除対象が owner                                                                        | `409`                                      |

アーカイブが先に保存されれば削除は409となり、参加情報を残します。
削除が先に Project 行をロックすればアーカイブは待機し、削除204・アーカイブ200で保存できます。
同じ参加情報への同時削除は先が204、後が404となります。role 変更が先なら変更200・削除204、削除が先なら削除204・変更404です。
DB の処理順を保証し、HTTP レスポンスの到着順は保証しません。
同じ User を再追加した場合は新しい ProjectMember ID を作り、古い memberId による削除では新しい参加情報を変更しません。
エラー本文・判定順・同時実行時の詳細は [UI_API.md](../../docs/UI_API.md) を参照してください。

## Task 一覧 API

Task の DB 定義と `GET /api/projects/:projectId/tasks` は PR #37 で `develop` にマージ済みです。
対象 Project の owner・member・viewer に許可し、アーカイブ済みも閲覧できます。非参加者と存在しない Project は同じ404で扱い、`ownerId` だけでは許可しません。

対象 Project の Task を `createdAt` の降順、同日時は `id` の降順で返します。Task がなければ200と空配列です。
返却項目は `id`・`projectId`・`title`・`description`・`status`・`priority`・`startDate`・`dueDate`・`createdAt`・`updatedAt` です。
description・開始日・期限の未設定は `null`、開始日・期限は `YYYY-MM-DD`、作成・更新日時は UTC の ISO 8601 形式とします。
レスポンス例とエラー本文は [UI_API.md](../../docs/UI_API.md#タスク一覧-get-apiprojectsprojectidtasks)、現在のDB定義は [ER.md](../../docs/ER.md#task-一覧-api-の初期実装) を参照してください。

Swaggerで成功時の一覧・詳細を試す場合は、APIが接続する開発DBにもmigrationを適用し、そのProjectに参加する本人のtokenを指定してください。テストDBへの適用だけでは、開発DBには反映されません。

## Task 詳細 API

`feat/phase-2/task-detail-api` では `GET /api/projects/:projectId/tasks/:taskId` を実装済みです。
本人の ProjectMember を確認した後、`projectId` と `taskId` の両方で対象を取得します。owner・member・viewer に許可し、アーカイブ済みも閲覧できます。
`ownerId` が本人でも参加情報がなければ取得できず、参加情報の削除後は同じtokenでも拒否します。

成功時は200と、一覧の各要素と同じ10項目の単一オブジェクトを返します。未設定の項目の `null` と、日付・日時の形式も一覧と同じです。
tokenなし・形式不正・無効は401、メール未設定・未確認は403です。
Project不在・非参加は404・「プロジェクトが見つかりません」とし、Taskの存在確認より先に判定します。
参加Project内のTask不在と別ProjectのTaskは、同じ404・「タスクが見つかりません」で扱います。両Projectに参加していても所属の違うTaskは取得できません。
レスポンス例とエラー本文は [UI_API.md](../../docs/UI_API.md#タスク詳細-get-apiprojectsprojectidtaskstaskid) を参照してください。

Task一覧・詳細WebとPR #43の番号・担当者・報告者、PR #44の作成API、PR #45の作成画面はマージ済みです。更新APIの後に更新画面へ進み、削除は別の操作として追加します。

## Task 作成 API

`POST /api/projects/:projectId/tasks`は、activeなProjectに参加するowner・memberへ許可します。必須入力は`title`だけです。

```json
{
  "title": "ログイン画面を作る",
  "description": "メールアドレスとパスワードでログインする",
  "status": "todo",
  "priority": "normal",
  "assigneeId": null,
  "startDate": "2026-10-30",
  "dueDate": "2026-11-02"
}
```

省略時の状態はtodo、優先度はnormal、担当者・説明・日付はnullです。担当者には同じProjectの参加者のUser IDを指定します。開始日・期限は時刻のない`YYYY-MM-DD`で、両方ある場合は期限が開始日以降である必要があります。
`number`・`reporterId`を含む定義外の入力は400で拒否します。番号はBackendで採番し、報告者は認証済み本人を設定します。成功時は201と、一覧・詳細と共通の13項目を返します。

採番とTask作成は同じtransactionに含め、途中の失敗ではカウンターの増加も取り消します。メンバー削除・role変更・アーカイブと同じProject行をロックし、ロック取得後にも最新の本人の権限・アーカイブ状態・担当者の参加を確認します。これにより、脱退済みのUserを担当者にしたTaskの保存や、権限を失った本人による作成を防ぎます。
入力・エラー・保存順の詳細は [UI_API.md](../../docs/UI_API.md#タスク作成-post-apiprojectsprojectidtasks) を参照してください。

Prisma StudioでTaskだけを作成しても`Project.lastTaskNumber`は増えません。API導入前にProjectごとの最大番号と比較し、カウンターが小さい場合は承認を得て補正します。カウンターを下げたり、既存Taskを自動変更する処理はありません。

作成のAPI E2Eは、認証・認可・入力の境界値・レスポンス・DBへの保存に加え、同時作成・削除後の番号再利用防止・失敗時のrollbackを確認します。競合テストはPostgreSQLの実際のロック待ちを確認し、メンバー削除・role変更・アーカイブと作成の保存順を検証します。

## Task 更新 API

`PATCH /api/projects/:projectId/tasks/:taskId`は、未アーカイブのProjectに参加するowner・memberへ許可します。title・description・status・priority・assigneeId・startDate・dueDateの7項目だけを受け取り、省略した項目は維持します。説明・担当者・日付のnullは解除を表し、タイトル・状態・優先度のnullは拒否します。本文なし・空のオブジェクト・定義外の項目は400です。

日付を片方だけ変更する場合も、最新のTaskと合わせて期限が開始日以降であることを確認します。保存時には作成・メンバー削除・role変更・アーカイブと同じProject行をロックし、本人の参加資格・role・アーカイブ状態・Taskの所属・担当者を再確認します。番号・報告者・採番カウンターは変更しません。

成功時は200と、詳細取得と同じ13項目の単一Taskを返します。同じ値だけを指定した場合は更新日時を維持します。認証・メール条件・viewer・Project不在・Task不在・担当者不正・日付不正・アーカイブ済みは、対応する401・400・403・404・409を返します。詳細は[UI_API.md](../../docs/UI_API.md#タスク更新-patch-apiprojectsprojectidtaskstaskid)を参照してください。

`tasks.e2e-spec.ts`でHTTP入力・認証・認可・返却項目・DBへの保存・省略とnull・日付・同値更新を確認し、`tasks.repository.e2e-spec.ts`で保存失敗時のrollbackと、Project行のロック待ちの間に参加情報・アーカイブ・日付が変わる場合を確認します。ローカルでは下記の専用環境を使い、開発用DB・Authユーザーを変更しません。

## 確認コマンド

```bash
pnpm --filter @bluemine/api typecheck
pnpm --filter @bluemine/api lint
```

### API E2E

API E2E では開発用 DB を使用しません。ルートの `.env` に `.env.example` の
`TEST_DATABASE_URL` と `POSTGRES_TEST_*` に加えて、テスト専用 Supabase の環境変数 3 つを設定します。
開発用 Supabase の既存ユーザーは使いません。`.env` の開発用設定を維持して実行する方法は、後述の「専用環境でのローカル実行」を参照してください。
専用 Supabase の接続先を設定済みの場合、Compose の API E2E 用 DB（通常5433）を次のように起動して実行できます。

```bash
docker compose --profile test up -d db-test
docker compose --profile test ps db-test
pnpm test:e2e
```

`pnpm test:e2e` はテスト用 URL を検証し、専用 DB に migration を適用してから
Supertest を実行します。`TEST_DATABASE_URL` が未設定、開発用 DB と同じ、または
DB 名が `_test` で終わらない場合は DB 操作前に停止します。

Auth E2E は実際のローカル Supabase Auth と専用テスト DB に接続し、次を確認します。

- token なしで `/api/auth/me` を呼ぶと `401` になる。
- 無効な token を送ると `401` になる。
- 一時ユーザーでログインした token を送ると `200` になり、本人の `id`・`email`・`name` が返り、DB に保存される。
- 名前の前後の空白が除かれ、API の応答と DB に反映される。
- Supabase の名前を変更して同じ token で再取得すると、既存 User の名前が更新される。
- 名前が未設定・空文字・空白のみ・`null`・数値・オブジェクトの場合、API の応答と DB の名前が `null` になる。
- Supabase の名前を空白に変更すると、既存 User の名前も `null` に更新される。

成功ケースは、実行ごとに異なるメールアドレスとランダムなパスワードを使います。
Secret key の管理クライアントで `email_confirm: true` のユーザーを作成し、
Publishable key のクライアントで `auth.signInWithPassword()` を呼びます。
取得した `session.access_token` を NestJS に送り、`finally` で今回作成した
アプリ側 User と Supabase Auth のユーザーの削除を試みます。固定のテストユーザーは不要です。
一時ユーザーの準備・後片付けは `auth.e2e-spec.ts` 内の `withTestUser()` にまとめています。

Projects E2E も実際のローカル Supabase Auth を使い、テストごとに確認済みの一時ユーザーと
access token を用意します。後片付けは ProjectMember → Project → User の順に行い、
Supabase Auth の一時ユーザーも削除します。

Projects E2E は Auth・Health・Tasks と合わせて `pnpm test:e2e` で実行します。次の確認を含めています。

- Project の基本6 API の token なし・無効な token の `401`（計12件）。メンバー一覧・追加・role変更・削除は、それぞれ token なし・形式不正・無効な token の3件を確認する。
- owner・member・viewer として参加している Project だけが一覧に含まれ、非参加 Project は含まれないこと。
- 参加 Project がない場合の空配列、参加情報がない場合に `ownerId` だけでは取得できないこと。
- 一覧の作成日時降順とアーカイブ済み Project の表示。
- 詳細取得の3 role の成功と、それぞれ本人の `currentUserRole` が返ること。アーカイブ済み Project でも viewer の role が返ること。レスポンス全体の比較で、既存の Project 項目と日時の維持、内部の `projectMembers` が含まれないことも確認する。
- 詳細取得で、別 Project に参加していても非参加 Project は取得できず、存在しない ID と同じ `404` になること。
- 詳細取得を拒否した場合に、対象の Project と ProjectMember の値・更新日時が変わらないこと。
- 設定更新の owner による成功・DB 保存、アーカイブ済み Project の設定更新。
- 設定更新で、member・viewer は `403`、別 Project の owner でも非参加 Project は存在しない ID と同じ `404` になること。本文が `{}` の場合も同じ認可を行うこと。
- 設定更新で、参加情報がなければ `ownerId` が本人でも `404` になること。
- 設定更新を拒否した場合に、Project と ProjectMember の値・更新日時が変わらないこと。
- アーカイブ・解除の owner による成功・DB 保存と、同じ状態への再操作の成功。
- アーカイブ・解除で、member・viewer は `403`、別 Project の owner でも非参加 Project は存在しない ID と同じ `404` になること。アーカイブ状態が `true`・`false` のどちらでも同じ認可を行うこと。
- アーカイブ・解除で、参加情報がなければ `ownerId` が本人でも `404` になること。
- アーカイブ・解除を拒否した場合に、Project と ProjectMember の値・更新日時が変わらないこと。
- 作成者の `ownerId` と `role: owner` の ProjectMember が DB に保存されること。
- 認証失敗時に Project が作成されず、更新・アーカイブ・解除でも DB が変わらないこと。
- 有効な token を使う既存の成功ケースと、入力・対象 ID に応じた `400`・`404`・`409`。
- メンバー一覧の16件: owner を含む一覧、必要な返却項目・名前の null、owner 先頭・その他は参加日時・ID 順、権限変更後の位置の維持、別 Project の除外、認証・認可エラーと拒否時の不変性。owner・member・viewer の各 role とアーカイブ状態の true・false の6通りで、一覧の取得と Project・ProjectMember の値・更新日時の維持を確認する。
- メンバー追加の41件: member・viewer の201、返却項目・名前の null・DB保存、email の前後空白の除去、別 Project に参加済みの User の追加。
- 追加時の401・403・404・400・409、Supabase Auth だけに登録された対象、メールの大文字・小文字の違い、owner 自身を含む参加済みの3 role、アーカイブ済み Project、必須項目・形式・型・role・定義外項目の検証。
- 同じ User の同時追加で201と409になり、参加情報が1件だけ保存されること。成功時は Project と既存参加情報を維持し、拒否時も Project・ProjectMember の値と更新日時が変わらないこと。User のプロフィール同期は比較に含めない。
- Service の事前確認後にアーカイブが完了しても、追加を409で拒否し、アーカイブ後の Project・ProjectMember の値と更新日時を維持すること。
- 追加が先に Project 行をロックした場合は、メンバー保存までアーカイブが実際にロック待ちとなり、追加201・アーカイブ200と DB 保存を確認できること。固定時間の待機には頼らず、失敗時も待機・ロック・spy を解除して後片付けする。
- role 変更の53件: member ↔ viewer の200、返却項目と名前の null、対象だけの保存、同じ role での200と更新日時の維持。
- role 変更の401・400・403・404・409、本文検証と認可・アーカイブ確認の優先順位、`ownerId` だけでは許可されないこと、別 Project の参加情報と User ID の取り違え、owner 自身の保護。
- role 変更の拒否時に Project・ProjectMember の値と更新日時が変わらず、同じ User の別 Project の参加情報も維持すること。User のプロフィール同期は比較に含めない。
- role 変更の事前確認後に Project・対象参加情報が削除されても保存時に404を返すこと。削除後の DB を再作成・更新しない。
- role 変更とアーカイブの競合3件: 保存直前にアーカイブされた場合は、同じ role・異なる role のどちらも409。role 変更が先に Project 行をロックした場合は、アーカイブが保存完了まで待ち、両方200になる。
- 同時 role 変更の2件: 1件目の保存待ちと2件目の Project 行ロック待ちを DB で確認し、後の member・viewer の指定を最新の role に適用する。固定時間の待機は使わず、失敗時も待機・ロック・spy を解除してから既存の後片付けへ戻す。
- メンバー削除の204・本文なしと、対象の参加情報だけが削除され、User・Supabase Auth アカウントが残ること。認可・対象不在の4ケース・owner 保護・アーカイブの判定順と、拒否時の Project・ProjectMember の値と更新日時の維持。
- メンバー削除とアーカイブ・同時削除・role 変更の競合。DB のロック待機を確認し、取得順に応じた成功・404・409と最終的な参加情報を検証する。
- 削除後の同じ User の再追加で新しい ProjectMember ID が発行され、古い memberId への削除が404となって新しい参加情報を維持すること。

テストは一覧・詳細・メンバー一覧・メンバー追加・メンバーrole変更・メンバー削除・作成・更新・アーカイブ・解除ごとの `describe()` に整理しています。
一覧・詳細・設定更新・アーカイブ・解除・メンバー一覧・追加・role変更・削除の membership・role による認可を API E2E で確認しています。

ユーザーを作成・削除するため、Auth E2E の成功ケースと Projects・Tasks E2E の接続先は
HTTP の `localhost`、`127.0.0.1`、`[::1]` に限定しています。
クラウドの Supabase や本番ユーザーは使用しません。
メール送信・確認リンクの操作は、この E2E の確認対象に含めていません。

ローカルでは `pnpm test:e2e` 自体は Supabase を起動・停止しないため、上記の準備が必要です。

#### Task 一覧の API E2E

[tasks.e2e-spec.ts](./test/tasks.e2e-spec.ts) に25件を追加しています。fixtureは同じファイル内でPrismaから準備し、Task作成APIは使いません。

- tokenなし・形式不正・無効なtokenの401、メール未設定・未確認の403。
- owner・member・viewer とアーカイブ状態の6通りでの取得、各roleの空一覧。
- 返却項目、nullable項目、status・priorityの初期値、日付のみの形式とUTCの日時、作成日時・IDの降順。
- 両Projectのownerでも指定ProjectのTaskだけを返すこと。非参加者と存在しないProjectの同じ404、queryのUser IDによるなりすましの拒否。
- `ownerId`が本人でも参加情報がなければ404となること、参加情報の削除後は同じtokenでも拒否すること。
- 成功・拒否時にProject・ProjectMember・Taskの値と更新日時を維持すること。認証時のUser同期は比較に含めません。

通常の認証は実際のSupabaseを使います。メール未設定・未確認の2件だけは、実tokenの検証結果のメール状態を差し替えてAPI側の拒否を確認します。
後片付けは今回作成したIDで限定し、Task → ProjectMember → Project → Userをtransactionで削除します。DB側で失敗してもAuthユーザーの削除とアプリの終了を試みます。

#### Task 詳細の API E2E

[tasks.e2e-spec.ts](./test/tasks.e2e-spec.ts) の詳細用 `describe()` で確認します。一覧とfixture・後片付けを共有します。

- tokenなし・形式不正・無効なtokenの401、メール未設定・未確認の403。
- owner・member・viewer とアーカイブ状態の6通りでの200と、返却する10項目・未設定の `null`・statusとpriorityの初期値。
- 説明・日付が設定されたTaskの内容、開始日・期限の `YYYY-MM-DD` と作成・更新日時のUTC ISO形式。
- 両Projectのownerでも、別ProjectのTaskと存在しないTaskが同じ404となること。
- 非参加Projectと存在しないProjectが同じ404となること。
- 取得成功後に本人の参加情報を削除すると、`ownerId` が本人でも同じtokenで404となること。
- 成功・拒否時にProject・ProjectMember・Taskの値と更新日時を維持すること。メール条件の403ではUserプロフィールの維持も確認します。

通常の認証は実際の専用Supabaseを使います。メール未設定・未確認の2件は、一覧と同じく実tokenの検証結果のメール状態だけを差し替えます。

#### 専用環境でのローカル実行

専用App DB（5434 / `bluemine_browser_test`）と専用Supabase（55321）を使います。
API E2EにはWeb/APIの開発サーバーやブラウザ用buildは不要です。同じ専用環境を使うPlaywrightとは同時に実行しないでください。

Docker Desktopを起動し、ルートで専用環境を準備します。

```bash
node e2e/start.mjs
pnpm --filter @bluemine/api exec prisma generate --config prisma7.config.ts
```

次に、専用環境のURLとキーを既存helperから取得して、API E2Eの子プロセスだけに渡します。管理キーを表示・保存せず、`.env`は書き換えません。
`pnpm test:e2e` が専用DBへmigrationを適用してから、Auth・Health・Projects・Tasksを実行します。

```bash
node --input-type=module <<'NODE'
import { spawnSync } from 'node:child_process';
import {
  getBrowserE2EAppEnvironments,
  getBrowserE2EAdminCredentials,
} from './e2e/environment.mjs';

const { api } = getBrowserE2EAppEnvironments();
const { secretKey } = getBrowserE2EAdminCredentials();
const result = spawnSync('pnpm', ['test:e2e'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    TEST_DATABASE_URL: api.DATABASE_URL,
    SUPABASE_URL: api.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: api.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: secretKey,
  },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
NODE
```

テストが失敗した場合も、最後に今回起動した専用環境を終了します。

```bash
node e2e/stop.mjs
```

### GitHub Actions

[ci.yml](../../.github/workflows/ci.yml) の `api_e2e` job は、一時的な PostgreSQL と
ローカル Supabase を用意し、同じ `pnpm test:e2e` を実行する構成です。

- loopback を既定の IPv4 アドレスとする専用ネットワークで Supabase を起動する。
- `supabase status --output json` から URL とキーを取得し、キーをログでマスクして `GITHUB_ENV` に設定する。
- アプリのテスト専用 DB に migration を適用し、Health・Projects・Auth・Tasks の API E2E を実行する。
- `if: always()` の終了処理で `supabase stop --no-backup` を実行し、CI 用の Supabase とそのデータを片付ける。

CI は起動したローカル Supabase のキーを使うため、クラウドのキーや個人の `.env` は必要ありません。
CI の `--no-backup` はデータを削除するので、データを保持するローカルの停止には付けません。
