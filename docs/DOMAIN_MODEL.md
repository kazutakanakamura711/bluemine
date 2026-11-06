# データモデルと業務ルール

## この資料の目的

この資料は「アプリが守るべきデータの意味とルール」を書く場所である。NestJS のファイル構成や、Entity / UseCase などの実装方法はここでは決めない。

完成形のテーブル関係は [ER.md](./ER.md) を参照する。ただし、初期実装では全テーブル・全ルールを一度に作らない。

## 段階的な実装範囲

| 段階 | 対象 | この段階で理解したいこと |
| --- | --- | --- |
| 1 | Health check | NestJS の Controller / Service の基本 |
| 2 | Project | DTO、Service、Repository、Prisma による基本 CRUD |
| 3 | User / ProjectMember | Supabase Auth と「誰が操作できるか」の確認 |
| 4 | Task | Project に属するデータの CRUD と入力ルール |
| 5以降 | Comment、TaskHistory、親子タスク、検索・絞り込み | 複数のデータをまたぐルールとトランザクション |

## 初期の主要データ

### User

認証を導入した後に使うアプリ側プロフィールである。パスワードは保存しない。

| 項目 | 説明 |
| --- | --- |
| id | Supabase Auth のユーザー ID と同じ ID |
| email | Supabase Auth で確認済みのメールアドレス |
| name | 画面に表示する名前。未設定は `null` |

Supabase Auth の登録と、アプリ側 User の作成は別である。
アプリ側 User は、有効な token と確認済みメールアドレスを持つ本人が、AuthGuard を通る API を初めて呼んだときに作成する。
Supabase Auth に登録済みでも、まだこの API 呼び出しを行っていなければ、アプリ側 User は存在しない。

名前は認証済み API の呼び出し時に Supabase Auth の `user_metadata.name` から同期する。
文字列なら前後の空白を除き、未設定・空白・文字列以外なら `null` として、既存の名前も更新する。
通常の登録画面では名前を必須にするが、名前を持たない既存ユーザーや管理 API で作成したユーザーも扱う。
名前は表示用であり、ユーザーの識別には `id` を使い、名前を認可判断には使わない。

### Project

タスクをまとめる単位である。

| 項目 | 説明 | 初期ルール |
| --- | --- | --- |
| id | プロジェクト ID | 自動採番する |
| name | プロジェクト名 | 前後の空白を除いた後、1〜100文字、必須 |
| key | タスク番号の接頭辞 | 英数字1〜20文字、重複不可、大文字で保存 |
| description | 概要 | 任意、2,000文字以内 |
| isArchived | アーカイブ状態 | 初期値は `false` |
| ownerId | 作成者 | 認証導入後は必須 |

例: `key` が `APP` のプロジェクトでは、将来タスクを `APP-1` のように表示する。

### ProjectMember

認証・メンバー管理を導入した後に、ユーザーがどのプロジェクトへ参加しているかを表す。

初期は次の三つの role だけを扱う。

| role | できること |
| --- | --- |
| owner | プロジェクトの作成者。設定・メンバー管理を含めすべて操作できる |
| member | プロジェクトとタスクを閲覧し、タスクを作成・更新できる |
| viewer | 閲覧だけできる |

- プロジェクト作成時に、作成者を `owner` とする ProjectMember も同時に作る。
- メンバー一覧の取得は、対象 Project に `owner`・`member`・`viewer` として参加しているユーザーに許可する。アーカイブ済み Project も閲覧できる。
- メンバーの追加・role変更・削除は、対象 Project の ProjectMember が `owner` のユーザーだけに許可する。閲覧・変更ともに本人の参加情報を確認し、`ownerId` や表示用の名前だけで許可しない。
- 追加対象は、アプリ側 User が存在するユーザーに限る。追加処理では対象 User を作成・同期しない。
- 追加対象はメールアドレスで指定する。前後の空白を除き、大文字・小文字を変換せず、保存された User.email と完全一致で検索する。参加情報には、取得した User の ID を保存する。
- 追加時に指定できる role は `member`・`viewer` だけとし、`owner` は追加できない。
- アーカイブ済み Project には、owner でもメンバーを追加できない。
- メンバー追加とアーカイブが同時に行われても、対象 Project の保存順を揃える。アーカイブが先に保存された場合は追加を拒否し、メンバー追加が先に保存された場合は、その後のアーカイブを許可する。
- 同じユーザーを同じプロジェクトへ二重登録しない。同時追加でも `(projectId, userId)` の unique 制約で重複を防ぐ。追加 API では、既存の参加情報の role・値・更新日時を変更しない。
- role 変更の対象は、指定した Project に属する ProjectMember の ID で指定する。これは User の ID とは異なる。別 Project の参加情報は、対象が存在しない場合と同じ応答で扱う。
- role 変更先は `member`・`viewer` に限定し、`owner` への昇格は許可しない。
- アーカイブ済み Project では、owner でもメンバーの role を変更できない。同じ role の指定も拒否する。
- 同じ role を指定した場合は成功とし、ProjectMember の値・更新日時を変更しない。実際に変更する場合は、対象の role と更新日時だけを変更し、Project と他の参加情報、対象の ID・所属・参加日時を維持する。
- role 変更とアーカイブは、対象 Project の行ロックで保存順を揃える。アーカイブが先に保存された場合は role 変更を拒否し、role 変更が先に行ロックを取得した場合は、その保存完了までアーカイブを待たせる。同じ role かどうかも、ロック取得後の最新の参加情報で判定する。
- 同じ参加情報の role を同時に変更する場合も、Project 行ロックの取得順に処理する。後の処理は最新の role に対して指定を適用し、既に同じ role なら更新しない。HTTP レスポンスの到着順は保証しない。
- メンバー削除の対象は、指定した Project に属する ProjectMember の ID で指定する。対象不在・別 Project の参加情報・User.id・削除済みの参加情報は、すべて同じ対象不在として扱う。
- 削除するのは対象の参加情報1件だけであり、対象の User と Supabase Auth アカウントは保持する。Project と残った参加情報、同じ User の別 Project の参加情報の値・更新日時は変更しない。
- アーカイブ済み Project では、owner でもメンバーを削除できない。対象の不存在・owner 保護より先にアーカイブ状態を判定する。
- メンバー削除とアーカイブ・role変更・同時削除は、Project 行ロックで順序を揃える。後続処理はロック取得後に最新の状態を確認し、対象が既に削除されていれば対象不在とする。アーカイブが先に保存されていれば削除を拒否し、削除が先にロックを取得していれば完了までアーカイブを待たせる。
- 削除後に同じ User を再追加すると、新しい ID を持つ ProjectMember を作成する。古い参加情報の ID を指定した削除では、新しい参加情報を変更しない。
- owner 自身を削除・role変更しない。
- メンバー操作を拒否した場合は、Project と ProjectMember の値・更新日時を変更しない。認証時の User プロフィール同期は、この不変性の対象に含めない。
- `manager` role は、owner と member の間の権限が本当に必要になったとき追加する。

### Task

Project に属する作業項目である。初期は、タスクを分かりやすく管理する最低限の項目だけを扱う。

| 項目 | 説明 | 初期ルール |
| --- | --- | --- |
| id | タスク ID | 自動採番する |
| projectId | 所属プロジェクト | 必須 |
| title | タスク名 | 前後の空白を除いた後、1〜200文字、必須 |
| description | 詳細 | 任意、前後の空白を除いた後、5,000文字以内。空文字はnull |
| status | 進行状態 | 初期値は `todo` |
| priority | 優先度 | 初期値は `normal` |
| startDate | 開始日 | 任意 |
| dueDate | 期限 | 任意。開始日より前にできない |
| createdAt | 作成日時 | 作成時に設定する |
| updatedAt | 更新日時 | 作成・更新時に設定する |

初期の status と priority は次に限定する。

```text
status:   todo | in_progress | done
priority: low  | normal      | high
```

- タスクは必ず1つの Project に所属する。
- アーカイブ済み Project にはタスクを作成・更新できない。
- 閲覧権限がないユーザーは、Project や Task を取得できない。
- `done` にした日時は、基本 CRUD を完成させた後に追加する。Project内連番・担当者・報告者は、下記の合意済みの範囲として段階的に追加する。

Task の DB 定義と一覧 API は PR #37、Web の Task 一覧・空状態・loading・error は PR #38、詳細取得 API は PR #41でマージ済みであり、詳細WebとPR #43の番号・担当者・報告者もマージ済みである。`feat/phase-2/task-create-api`では作成APIを追加する。作成画面・更新・削除API・画面は後続とする。

- 一覧・詳細の閲覧には本人の ProjectMember が必要であり、owner・member・viewer に許可する。`ownerId` が本人でも参加情報がなければ許可しない。参加情報の削除後は、同じ token でも取得できない。
- アーカイブ済み Project の Task も閲覧できる。Project 不在と非参加者による取得は、同じ対象不在として扱う。
- 詳細取得では、指定した Project に属する Task だけを取得する。両方の Project に参加していても別 Project の Task は取得できず、その Project 内に Task が存在しない場合と同じ対象不在として扱う。
- `description`・`startDate`・`dueDate` の未設定は `null` とする。開始日・期限は時刻を持たない日付であり、DB には `DATE` 型で保存する。
- `createdAt`・`updatedAt` は日時として保存する。日付・日時の API 返却形式と一覧の並び順は [一覧の仕様](./UI_API.md#タスク一覧-get-apiprojectsprojectidtasks)、1件取得の返却形式とエラーは [詳細の仕様](./UI_API.md#タスク詳細-get-apiprojectsprojectidtaskstaskid) を参照する。
- 作成APIはtitle・descriptionの文字数、日付の前後関係、owner・memberだけの作成権限、アーカイブ済みProjectへの作成禁止を検証する。更新時も対応するAPIで検証する。現在のDB定義には、文字数・日付の前後関係のCHECK制約は設けていない。

### Task の追加範囲（2026-10-29合意・段階導入中）

PR #43で、次の3カラムと制約、Projectの採番用カウンター `lastTaskNumber`（初期値0）を追加済みである。一覧・詳細APIは `number`、担当者の `{ id, name }` または `null`、必須の報告者の `{ id, name }` を含む13項目を返す。Userの名前は未設定を許可する。一覧・詳細Webは番号・担当者・報告者を表示し、メンバー削除APIは対象Projectの担当を解除する。今回の作成APIで採番・担当者検証・報告者設定を追加する。

| 項目 | 意味 | ルール |
| --- | --- | --- |
| number | Project内のタスク番号 | 1から始まる整数。`(projectId, number)` をDBの一意制約で保護する |
| assigneeId | 担当者のUser ID | `User.id` を参照し、未担当は `null` |
| reporterId | 報告者（作成者）のUser ID | 必須。`User.id` を参照し、DBでも `NOT NULL` とする |

- 表示上の番号は `Project.key` と `Task.number` を組み合わせ、`APP-12` のように表示する。DB・URLで使うTaskの `id` は引き続き別の識別子として保持する。
- 採番はBackendのTask作成処理で行う。Projectの `lastTaskNumber` をDB上で安全に増加させ、採番とTask作成を同じtransactionに含める。Task作成失敗時はカウンター更新も取り消す。作成APIはProject行をロックして本人の最新の参加情報・role、アーカイブ状態、担当者の参加情報を確認してから採番・保存する。
- 同時作成時の作成順はDBが採番処理を進めた順とする。作成済みTaskの番号は変更せず、Task削除後も番号を詰めたり再利用したりしない。
- 担当者の設定時は、指定したUserが同じProjectのProjectMemberであることをAPIで検証する。
- ProjectMemberを削除する際は、対象ProjectでそのUserが担当するTaskの `assigneeId` を、完了済みを含めて `null` にし、変更したTaskの `updatedAt` を更新する。Task自体・状態・報告者は保持し、未担当・他のUserの担当・他ProjectのTaskの値と更新日時は変更しない。担当解除と参加情報削除はProject行をロックした同じtransactionで行い、途中で失敗した場合は両方を取り消す。担当者設定APIを追加するときもProject単位で保存順を揃える。
- 報告者は作成者として必ず記録し、通常のTask作成APIでは認証済み本人の `User.id` を自動設定する。クライアントから報告者のIDを受け取って本人の代わりに使わず、通常のTask更新APIでは変更しない。報告者必須化のmigrationを適用する前に、既存Taskの `reporterId` がすべて設定済みであることを確認する。
- Projectから報告者の参加情報が削除されても、Userは残るため `reporterId` は保持する。担当者・報告者の外部キーは `ON DELETE RESTRICT` とし、Taskから参照されているUserの物理削除を拒否する。
- 既存の開発用Taskは、ユーザーがPrisma Studioで削除してから追加migrationを適用した。Project・User・ProjectMember・Authユーザーは保持する。新しい環境へ適用する際も、必須の `number` を追加する前に既存Taskの有無を確認する。

## 認証・認可の基本方針

- 認証は Supabase Auth を使う。
- Frontend が表示を隠すだけでは不十分である。NestJS API でも、ログイン済みか・対象 Project の member かを確認する。
- 操作する本人は、クライアントから渡された `userId` ではなく、認証済み token から特定する。

全 Project API の認証保護、membership・role による認可、Project 作成時の owner 登録は実装済みである。
メンバー一覧 API は参加者の3 role に、追加・role変更・削除 API は owner に許可する。各 API と Web のメンバー一覧・追加・role変更・削除 UI は実装済みである。Task 一覧・詳細 API も同じ認証・認可の基盤を使い、残る Task CRUD を操作ごとに追加する。

## 後続段階で追加するもの

以下は ER 図には含めるが、初期 CRUD を理解してから追加する。

- `in_review`、`closed` など、より細かい status
- `completedAt`、予定工数
- 親子タスクと循環参照の防止
- Comment と論理削除
- TaskHistory と変更差分の記録
- manager role、詳細な権限表
- フィルタ、ページネーション、全文検索

複数のテーブルを同時に更新する必要が生じた時点で、Prisma の transaction を使う。例えば Project と owner membership を同時に作る処理が対象になる。
