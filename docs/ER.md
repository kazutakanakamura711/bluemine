# Entity Relationship Diagram

この図は完成時のデータモデル案である。カラム定義とビジネスルールは、実装を進めながら本書と要件資料へ段階的に追記する。

```mermaid
erDiagram
    User ||--o{ Project : owns
    User ||--o{ ProjectMember : joins
    Project ||--o{ ProjectMember : has
    Project ||--o{ Task : has
    User ||--o{ Task : reports
    User |o--o{ Task : assigned
    Task ||--o{ Comment : has
    User ||--o{ Comment : writes
    Task ||--o{ TaskHistory : records
    User ||--o{ TaskHistory : performs

    User {
        string id PK "Supabase Auth UUID"
        string email UK
        string name "nullable"
        string avatar_url "nullable"
        datetime created_at
        datetime updated_at
    }

    Project {
        string id PK
        string owner_id FK
        string name
        string key UK
        string description "nullable"
        boolean is_archived
        datetime created_at
        datetime updated_at
    }

    ProjectMember {
        string id PK
        string project_id FK
        string user_id FK
        enum role "owner | member | viewer"
        datetime joined_at
    }

    Task {
        string id PK
        string project_id FK
        int number
        string parent_task_id FK "nullable, self-reference"
        string reporter_id FK
        string assignee_id FK "nullable"
        string title
        string description "nullable"
        enum status "todo | in_progress | in_review | done | closed"
        enum priority "low | normal | high | urgent"
        date start_date "nullable"
        date due_date "nullable"
        decimal estimated_hours "decimal(10,2), nullable"
        datetime completed_at "nullable"
        datetime created_at
        datetime updated_at
    }

    Comment {
        string id PK
        string task_id FK
        string author_id FK
        string body
        datetime deleted_at "nullable"
        datetime created_at
        datetime updated_at
    }

    TaskHistory {
        string id PK
        string task_id FK
        string actor_id FK
        enum action "created | updated | commented | assigned | status_changed"
        json changes "nullable"
        datetime created_at
    }
```

## Task 一覧 API の初期実装

現在の作業ブランチでは、完成形の図から次の範囲だけを実装している。

- Task の項目は `id`・`projectId`・`number`・`assigneeId`・`reporterId`・`title`・`description`・`status`・`priority`・`startDate`・`dueDate`・`createdAt`・`updatedAt` とする。
- DB のテーブル名は `tasks` とし、`project_id` は必須で `projects.id` を参照する。`ON DELETE RESTRICT` により、Task が残る Project の物理削除を拒否する。
- `description`・`start_date`・`due_date` は nullable、開始日・期限は `DATE` 型とする。status は `todo | in_progress | done`、priority は `low | normal | high` に限定し、初期値はそれぞれ `todo`・`normal` とする。
- 一覧取得用に `(project_id, created_at, id)` の複合 index を設ける。これは一意制約ではなく、Task の主キーは `id` である。
- [Task 追加の migration](../apps/api/prisma/migrations/20261026102234_add_task/migration.sql) は2つの enum・tasks テーブル・index・外部キーを追加する。既存テーブルの削除や既存データの更新は行わない。Prisma の `Project.tasks` は逆参照であり、projects テーブルにカラムを追加しない。
- [番号・担当者・報告者追加の migration](../apps/api/prisma/migrations/20261029092424_add_task_number_assignee_reporter/migration.sql) は、Taskの必須の `number`・nullableなUUIDの `assignee_id`・`reporter_id`、`(project_id, number)` の一意制約とUserへの外部キーを追加する。Userへの参照は `ON DELETE RESTRICT` とし、参照中のUserの物理削除を拒否する。Projectには採番用の `last_task_number` を初期値0で追加する。
- [報告者必須化のmigration](../apps/api/prisma/migrations/20261029123944_require_task_reporter/migration.sql) で `reporter_id` を `NOT NULL` にする。適用前に、既存Taskの報告者がすべて設定済みであることを確認する。適用済みの上記migrationは変更しない。
- 親子関係・予定工数・完了日時は後続とし、現在の Prisma schema には含めていない。

2026-10-29に、番号・担当者・報告者は基本機能へ段階導入する範囲として合意し、現在の作業ブランチでカラム・制約を追加した。メンバー削除APIは対象Projectの担当を解除し、報告者は作成者の記録として保持する。Task作成APIでの採番は後続とする。採番・transaction・既存データの扱いは [DOMAIN_MODEL.md](./DOMAIN_MODEL.md) を参照する。

## 補足制約（完成形）

- `Task.parent_task_id` は `Task.id` を参照する自己参照FKである
- Mermaid上では可読性を優先し、TaskからTaskへの自己参照線を省略している
- `ProjectMember` は `(project_id, user_id)` の組み合わせで一意とする
- `ProjectMember.role` は初期実装では `owner | member | viewer` とする。`manager` は owner と member の間の権限が必要になった時点で追加を検討する
- `Task` は `(project_id, number)` の組み合わせで一意とする
- `Task.assignee_id` は `User.id` を参照し、未担当は `null` とする。`Task.reporter_id` は作成者の `User.id` を必須で参照する
