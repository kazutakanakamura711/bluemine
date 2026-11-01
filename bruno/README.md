# Bruno でのローカル認証確認

Bruno で [redmine-next-nest-api](./redmine-next-nest-api/) をコレクションとして開きます。
リクエストは OpenCollection の YAML 形式で保存しています。

| リクエスト                                                                           | 呼び出す API                                               | 用途                                       |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------ |
| [supabase-login](./redmine-next-nest-api/supabase-login.yml)                         | Supabase: `POST /auth/v1/token?grant_type=password`        | ログインして access token を取得           |
| [auth-me](./redmine-next-nest-api/auth-me.yml)                                       | NestJS: `GET /api/auth/me`                                 | 本人のアプリ側 User を取得・初回作成       |
| [create-project](./redmine-next-nest-api/create-project.yml)                         | NestJS: `POST /api/projects`                               | Project と作成者の owner membership を作成 |
| [get-projects](./redmine-next-nest-api/get-projects.yml)                             | NestJS: `GET /api/projects`                                | Project 一覧を取得                         |
| [get-project](./redmine-next-nest-api/get-project.yml)                               | NestJS: `GET /api/projects/:projectId`                     | Project 詳細を取得                         |
| [update-project](./redmine-next-nest-api/update-project.yml)                         | NestJS: `PATCH /api/projects/:projectId`                   | Project 名・説明を更新                     |
| [archive-project](./redmine-next-nest-api/archive-project.yml)                       | NestJS: `POST /api/projects/:projectId/archive`            | Project をアーカイブ                       |
| [unarchive-project](./redmine-next-nest-api/unarchive-project.yml)                   | NestJS: `POST /api/projects/:projectId/unarchive`          | Project のアーカイブを解除                 |
| [get-project-members](./redmine-next-nest-api/get-project-members.yml)               | NestJS: `GET /api/projects/:projectId/members`             | 参加者がメンバー一覧を取得                 |
| [add-project-member](./redmine-next-nest-api/add-project-member.yml)                 | NestJS: `POST /api/projects/:projectId/members`            | owner が登録済み User を追加               |
| [update-project-member-role](./redmine-next-nest-api/update-project-member-role.yml) | NestJS: `PATCH /api/projects/:projectId/members/:memberId` | owner がメンバーの role を変更             |
| [get-tasks](./redmine-next-nest-api/get-tasks.yml)                                   | NestJS: `GET /api/projects/:projectId/tasks`               | 参加者がタスク一覧を取得                   |
| [create-task](./redmine-next-nest-api/create-task.yml)                               | NestJS: `POST /api/projects/:projectId/tasks`              | owner・memberがタスクを作成                |
| [update-task](./redmine-next-nest-api/update-task.yml)                               | NestJS: `PATCH /api/projects/:projectId/tasks/:taskId`     | owner・memberがタスクを部分更新            |
| [supabase-update-password](./redmine-next-nest-api/supabase-update-password.yml)     | Supabase: `PUT /auth/v1/user`                              | ログインユーザーのパスワードを変更         |

NestJS は `http://localhost:3001`、ローカル Supabase は `http://127.0.0.1:54321` で動きます。
Supabase のリクエストは外部サービスの操作なので、NestJS の Swagger には含めません。

## 1. ローカル環境とテストユーザーを用意する

Docker network、アプリ用 DB、API の起動方法は [API README](../apps/api/README.md#開発) を参照してください。
以下のコマンドはリポジトリのルートで実行します。

```bash
pnpm exec supabase start --network-id redmine-local-network
pnpm exec supabase status
```

ローカルの [Supabase Studio](http://127.0.0.1:54323/project/default/auth/users) で、
**Authentication → Users → Add user → Create new user** を開きます。
メールアドレス（例: `bruno@example.com`）とテスト用のパスワードを入力し、
**Auto confirm user** にチェックを入れて作成します。

このユーザーは手動確認用です。Supabase のクラウド管理画面にログインするアカウントとは別です。
API E2E は実行ごとに一時ユーザーを作成・削除するため、この固定ユーザーを使いません。

## 2. Bruno の Local 環境を設定する

**Environments → Local** を開き、次の変数を有効にして Save します。
Local がない場合は、コレクションの環境として作成してください。
Mac では `Command + E` で環境の編集画面を開けます。

| タブ      | 変数名                   | 設定する値                                      |
| --------- | ------------------------ | ----------------------------------------------- |
| Variables | `supabasePublishableKey` | ローカルの `.env` の `SUPABASE_PUBLISHABLE_KEY` |
| Variables | `loginEmail`             | Studio に登録したテストユーザーのメールアドレス |
| Secrets   | `loginPassword`          | 同じユーザーのパスワード                        |
| Secrets   | `accessToken`            | 最初は空欄。ログイン後に設定                    |

右上の環境選択で **Local** を選びます。
`{{loginEmail}}` などの記述は、送信時に Local の変数の値に置き換わります。
Publishable key を送る HTTP ヘッダーの名前は `apikey` です。
`SUPABASE_SECRET_KEY` はこの手動操作では使いません。

パスワードと token の値は Secrets に保存し、リクエストの Body や通常の Variables に直接書きません。
Bruno の Secrets の実際の値は、環境の YAML ファイルには保存されません。
ローカル用のキーを含む `environments/Local.yml` も Git の対象から外しています。
別の PC では、この手順に従って Local 環境を作成してください。

## 3. ログインして token を保存する

`supabase-login` の設定は次のとおりです。

- メソッド・URL: `POST http://127.0.0.1:54321/auth/v1/token?grant_type=password`
- Auth: **No Auth**
- Headers: `apikey: {{supabasePublishableKey}}`、`Content-Type: application/json`
- Body: JSON

```json
{
  "email": "{{loginEmail}}",
  "password": "{{loginPassword}}"
}
```

1. **Send** を押し、`200 OK` を確認します。
2. レスポンスの `access_token` の値だけをコピーします。引用符や `Bearer` は含めません。
3. **Environments → Local → Secrets → accessToken** に貼り付けて **Save** します。

この HTTP レスポンスでは `access_token` は最上位にあります。
SDK の `signInWithPassword()` では `session.access_token` として取得します。

## 4. 本人の User と Project API を確認する

`auth-me` の Auth は **Bearer Token**、Token は `{{accessToken}}` に設定済みです。
Send すると、Bruno が `Authorization: Bearer <access_token>` を付けて送信します。

| 応答               | 意味                                                                         |
| ------------------ | ---------------------------------------------------------------------------- |
| `200 OK`           | 本人のアプリ側 User（`id`、`email`、`name`、`createdAt`、`updatedAt`）を返す |
| `401 Unauthorized` | token がない、Bearer 形式が不正、または token が無効                         |
| `403 Forbidden`    | token は有効だがメールアドレスが未設定・未確認                               |

`id` と `email` が Supabase のログインユーザーと一致することを確認します。
未登録なら User を初回作成し、登録済みならメールアドレスと `user_metadata.name` の名前を更新します。
名前は前後の空白を除き、未設定・空白・文字列以外の場合は `null` にします。
既存の名前も同期するため、Supabase の名前が空白になるとアプリ側も `null` になります。

続けて `create-project` を Send すると、`201 Created` と `ownerId` が返ります。
Body の `key` は未使用の値にしてください。作成者の ProjectMember も `role: owner` で保存されます。

Project の基本6リクエストとメンバー一覧・追加・role変更にも **Bearer Token** の `{{accessToken}}` を設定しています。
`get-projects` は `200 OK` と Project の配列を返します。
詳細・更新・アーカイブ・解除の URL にある Project ID は、作成した Project の `id` に置き換えてください。
これらの成功時の応答は `200 OK` と、対象の Project（`ownerId` を含む）です。
`get-project` の詳細レスポンスだけには、ログイン中のユーザー自身の `currentUserRole` も含まれます。
参加している Project で owner・member・viewer の各 token を使うと、それぞれの role が返ります。
アーカイブ済みでも返り、内部の `projectMembers` は含まれません。

Project の一覧・詳細とメンバー一覧は参加者の owner・member・viewer が取得でき、更新・アーカイブ・解除とメンバー追加・role変更・削除は owner のみ操作できます。
存在しない Project と非参加者は同じ404、参加者の権限不足は403になります。
認証・認可の仕様と確認範囲は [API README](../apps/api/README.md#project-api-の認証と-owner-登録) を参照してください。

`get-tasks` も **Bearer Token** の `{{accessToken}}` を使います。
URL は `http://localhost:3001/api/projects/{{projectId}}/tasks` です。
`projectId` に参加している Project の ID を設定し、リクエストの Variables で同名の変数を使う場合は、そちらにも対象 ID を設定してください。
owner・member・viewer が取得でき、アーカイブ済み Project も閲覧できます。
成功時は `200 OK` と作成日時の降順（同じ日時なら ID の降順）のタスク配列を返し、タスクがなければ `[]` を返します。
認証 token がない・無効な場合は `401`、Project が存在しない・参加していない場合は `404` です。

## 5. メンバー一覧・追加を確認する

`get-project-members` と `add-project-member` の URL は、確認したい Project の ID に置き換えます。

```text
http://localhost:3001/api/projects/PROJECT_ID/members
```

どちらも **Auth → Bearer Token → Token** は `{{accessToken}}` です。
owner の token は、その Project を作成したユーザーでログインして取得する access token です。
API は token で本人を特定し、対象 Project の参加情報を確認します。一覧は owner・member・viewer が閲覧でき、追加は owner のみです。

追加対象には、確認済みメールを持つ別ユーザーを用意します。Supabase Auth の登録とアプリ側 User の作成は別なので、次の順で確認します。

1. 手順1と同じ方法で、Supabase Studio に追加対象のテストユーザーを作成します。
2. Local の `loginEmail`・Secrets の `loginPassword` を追加対象のユーザーに変更し、`supabase-login` を Send します。
3. 取得した `access_token` を Secrets の `accessToken` に保存し、`auth-me` を Send して200を確認します。これで追加対象のアプリ側 User が作成されます。
4. Local のログイン情報を Project の owner に戻し、再び `supabase-login` を Send します。取得した token を Secrets の `accessToken` に保存し、`auth-me` の email で実行者を確認します。
5. owner の token で `get-project-members` を Send し、200と owner 自身を含む一覧を確認します。Body は不要です。
6. `add-project-member` の **Body → JSON** に追加対象のメールアドレスと role を指定し、Send します。

```json
{
  "email": "test@example.com",
  "role": "member"
}
```

email は追加対象のアプリ側 User に保存された値に置き換えます。前後の空白は除去し、大文字・小文字は区別します。
role は member・viewer のどちらかで、owner は指定できません。

追加成功時は201と単一メンバーが返ります。続けて一覧を再送信し、追加したユーザーの名前・メール・role が増えていることを確認します。
同じユーザーを再度追加すると409になり、既存の role は変更されません。アーカイブ済み Project への追加も409です。
追加後は、追加した member・viewer の token に切り替えて一覧が200になること、同じ token で追加すると403になることも確認できます。
アーカイブ済み Project の一覧も参加者は200で取得できます。非参加者と存在しない Project は同じ404になります。
role 変更は次の手順6で確認できます。メンバー削除 API の仕様は [API README](../apps/api/README.md#メンバー削除) を参照してください。

確認後は両方のリクエストを保存します。Token の設定は `{{accessToken}}` を維持し、実際の token は Secrets に保存します。
リクエスト内の Project ID と追加対象メールはローカル確認用の例なので、別の環境ではそれぞれ置き換えてください。

2026-10-13 のユーザーによる手動確認では、owner の一覧取得が200、メンバー追加が成功し、再取得した一覧に owner・member の2人が返ることを確認済みです。

## 6. メンバーの role を変更する

`update-project-member-role` は、owner が既存の参加情報の role を member・viewer に変更するリクエストです。
Auth は **Bearer Token**、Token は `{{accessToken}}` を使います。

1. Project の owner でログインし、取得した token を Local の Secrets の `accessToken` に保存します。`auth-me` の email で実行者を確認します。
2. `get-project-members` を Send し、変更したい member・viewer の参加情報を選びます。
3. 保存済み URL の `<projectId>` を対象 Project の ID、`<projectMemberId>` を選んだ参加情報の **`id`（ProjectMember.id）** に置き換えます。`userId` は使いません。

```text
PATCH http://localhost:3001/api/projects/<projectId>/members/<projectMemberId>
```

山括弧付きの値は、送信前に実際の ID へ置き換えるためのプレースホルダーです。
Bruno の環境変数ではありません。`<projectMemberId>` の位置が API の `:memberId` に対応します。

4. **Body → JSON** に変更先の role だけを指定し、Send します。

```json
{
  "role": "viewer"
}
```

成功時は200と単一メンバーが返ります。`id`・`userId` が選んだ参加情報と一致し、role が指定した値になっていることを確認します。
続けて `get-project-members` を再送信し、一覧にも変更が反映されていることを確認します。
member に戻す場合は本文を `{"role":"member"}` にして送信します。

同じ role を再送信した場合も200となり、Project・ProjectMember の値と更新日時を変更しません。
`updatedAt` はレスポンスに含めず、不変性は API E2E でも確認しています。
role に owner・manager を指定すると400、対象が owner なら409、アーカイブ済み Project も409になります。
別 Project の参加情報の ID と存在しない ID は、同じ対象メンバーの404で拒否します。

リクエストを保存するときも Token は `{{accessToken}}` のままとし、実際の token は Secrets に保存します。
2026-10-16 に、ユーザーから Bruno による role 変更の成功報告を受けています。

## 7. パスワードを変更する

`supabase-update-password` は **Bearer Token** の `{{accessToken}}` を使い、
`PUT http://127.0.0.1:54321/auth/v1/user` に次の JSON を送ります。
Headers は `apikey: {{supabasePublishableKey}}` と `Content-Type: application/json` です。

```json
{
  "password": "{{loginPassword}}"
}
```

1. 現在のパスワードで `supabase-login` を Send し、有効な token を Secrets の `accessToken` に保存します。
2. Secrets の `loginPassword` を新しいパスワードに変更して **Save** します。
3. `supabase-update-password` を **Send** し、`200 OK` を確認します。
4. `supabase-login` を再度 **Send** し、新しいパスワードで `200 OK` になることを確認します。
5. 新しく取得した `access_token` を Secrets の `accessToken` に保存します。

Bruno の `loginPassword` を変えるだけでは、Supabase 側のパスワードは変わりません。
手順3の更新が成功してから、新しいパスワードでログインできます。

## エラー時の確認

| エラー                                         | 確認する内容                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| ログインの `400 invalid_credentials`           | Local が選択されているか、メールアドレスの綴り、保存したパスワードが Supabase 側と一致するか                            |
| `auth-me`・Project API・パスワード変更の `401` | 有効な access token を Secrets に保存したか。期限切れなら `supabase-login` を再送信し、新しい `access_token` を保存する |
| `auth-me`・Project API の `403`                | メールアドレスが確認済みか。owner 専用操作では、対象 Project の owner でログインしているか                              |
| Project API の `404`                           | Project ID が正しいか、実行者が対象 Project に参加しているか                                                            |
| メンバー追加の対象 User の `404`               | 対象ユーザーが `auth-me` を実行済みか、アプリ側 User のメールアドレスと大文字・小文字も一致しているか                   |
| メンバー追加の `400`                           | email・role が必須条件を満たし、role が member・viewer で、定義外の項目がないか                                         |
| メンバー追加の `409`                           | 対象ユーザーが参加済みではないか、Project がアーカイブ済みではないか                                                    |
| メンバーrole変更の `400`                       | role が member・viewer のどちらかで、必須項目があり、定義外の項目・前後空白・大文字を含んでいないか                     |
| メンバーrole変更の対象メンバーの `404`         | URL の Project ID と ProjectMember.id が同じ参加情報を指しているか。User.id を指定していないか                          |
| メンバーrole変更の `409`                       | 変更対象が owner ではないか、Project がアーカイブ済みではないか                                                         |
| Project 作成の `409`                           | Body の `key` が既存 Project と重複していないか                                                                         |

操作後は `pnpm exec supabase stop` で Supabase を停止できます。通常の停止ではローカルデータを保持します。

## タスクを作成する

[create-task](./redmine-next-nest-api/create-task.yml)を開き、`projectId`に対象ProjectのID、Secretsの`accessToken`にowner・member本人のtokenを設定します。
Bodyはtitleだけでも送信できます。担当者を指定する場合は`assigneeId`を、メンバー一覧の`userId`へ置き換えます（参加情報の`id`とは異なります）。viewerも担当者として指定できます。

成功時は201で、採番した`number`と本人の`reporter`を含むTaskが返ります。続けて一覧・詳細で保存結果を確認できます。`number`・`reporterId`は送信しません。
日付は`YYYY-MM-DD`とし、期限を開始日より前にすると400、viewer本人の作成は403、アーカイブ済みProjectでは409になります。
番号競合の409になった場合は、Studioで手動作成したTaskの最大番号とProjectの採番カウンターの整合性を確認します。開発データの補正は別途承認を得て行い、番号を詰めたりカウンターを下げたりしません。

## タスクを更新する

[update-task](./redmine-next-nest-api/update-task.yml)を開き、リクエストのVariablesに対象の`projectId`と`taskId`を設定します。`taskId`には一覧・詳細の`id`を使い、表示用の番号は使いません。LocalのSecretsの`accessToken`には、対象Projectのowner・member本人のtokenを設定します。

初期のBodyは`{"status":"in_progress"}`です。省略した項目は現在値を維持します。タイトル・説明・優先度・担当者・日付も更新する場合は、変更したい項目だけをJSONへ追加します。担当者にはメンバー一覧の`userId`、日付には`YYYY-MM-DD`を指定します。
説明・担当者・日付を`null`にすると、その項目を解除します。タイトル・状態・優先度の`null`と、空の本文`{}`は400になります。番号・報告者は送信しません。

Sendして200と更新後のTaskが返ることを確認し、`get-task`でも保存結果を確認します。同じ値だけを送信した場合は200となり、`updatedAt`も維持します。viewerの更新は403、アーカイブ済みProjectは409です。入力とエラーの詳細は[更新APIの仕様](../docs/UI_API.md#タスク更新-patch-apiprojectsprojectidtaskstaskid)を参照してください。

## Swagger と公式資料

NestJS の Swagger は [http://localhost:3001/api/docs](http://localhost:3001/api/docs) です。
**Authorize** に access token の値だけを入力すると、`GET /api/auth/me` と全 Project API を実行できます。
Project のレスポンスには、作成者の UUID を示す `ownerId` も記載しています。

- [Supabase Auth の API 仕様](https://github.com/supabase/auth#endpoints)
- [Supabase のローカル開発](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Bruno の環境変数](https://docs.usebruno.com/variables/environment-variables)
- [Bruno の Secret Variables](https://docs.usebruno.com/secrets-management/secret-variables)
