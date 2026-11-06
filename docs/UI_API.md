# 画面と REST API の仕様

## この資料の使い方

画面と API は、最初から全て作らない。各段階で必要な route と endpoint だけを実装し、動作確認とテストを終えてから次へ進む。

## 画面の実装順

### 段階1: 最小の画面

| URL | 目的 |
| --- | --- |
| `/` | アプリの入口。ヘルスチェック結果または簡単な案内を表示する |
| `/projects` | プロジェクト一覧を表示する |
| `/projects/new` | プロジェクトを作成する |

### 段階2: 認証・メンバー

| URL | 目的 |
| --- | --- |
| `/login` | Supabase Auth でログインする |
| `/register` | ユーザー登録をする |
| `/confirm` | 確認メールの情報を検証し、確認後にアプリへ移動する Route Handler |
| `/projects/[projectId]/members` | メンバーの追加・閲覧・role変更・削除をする |

メンバー管理画面は一覧表示から順に実装する。メンバータブと一覧は、対象 Project に参加する owner・member・viewer に表示する。
メンバー追加・role変更・削除の操作と設定タブは owner にだけ表示する。owner 自身の role変更・削除操作は表示しない。
アーカイブ済み Project でも一覧は閲覧できるが、メンバー追加・role変更・削除はできない。
表示制御にかかわらず、API でも各操作の membership・role を検証する。

一覧表示は Project 詳細・メンバー一覧・本人情報の API に接続済みである。
メンバー追加フォームは、メールアドレスと権限を検証した後、追加 API に送信する。role変更は行内編集から保存 API への接続まで、削除は確認 Dialog から削除 API・結果表示・一覧再取得まで実装済みである。
入力検証は初回の送信時に行い、その後は入力変更時に再検証して、項目の下にエラーを表示する。メールアドレスは trim 後の必須・形式を検証し、大文字・小文字を変換しない。権限は member・viewer のみ許可する。フォームを閉じると入力値とエラーを初期化し、再び開いた場合も初回の送信までは検証しない。
blur による入力検証は行わず、キャンセル・閉じるボタン・Escape キー・背景クリックで閉じる際に新しい入力エラーを表示しない。「追加」ボタンでの送信時は必ず入力を検証する。
フォームの入口は owner の一覧ヘッダーに表示し、アーカイブ済みの場合は無効にして理由を表示する。PC は中央、狭い画面では下寄せの Dialog とし、権限は「メンバー」「閲覧者」の2択、初期値は「メンバー」とする。キャンセル・閉じるボタン・Escape キーで閉じ、入口にフォーカスを戻す。
送信中は「追加中...」と表示し、入力欄・追加・キャンセル・閉じるボタンを無効にする。入力欄と追加ボタンの無効化により通常操作での二重送信を防ぎ、Escape キーや背景クリックでも閉じない。
成功時は「メンバーを追加しました」と通知し、フォームを初期化して Dialog を閉じる。`router.refresh()` で一覧を再取得し、件数・並び順も API の結果に合わせる。
失敗時は Dialog と入力値を保持し、API が返す業務エラーのメッセージを表示する。404・409 は複数の原因があるため、status だけでメールアドレスのエラーと判断しない。通信エラーなど、API の業務エラー以外は固定の案内を表示し、修正・再送信またはキャンセルできる。
一覧には件数と、名前・メールアドレス・権限・参加日を表示する。PC は表、モバイルはカード形式とし、API の並び順を維持する。
名前が未設定・空白だけの場合は「名前未設定」と表示する。権限は「オーナー」「メンバー」「閲覧者」、参加日は日本時間の `YYYY/MM/DD` で表示する。
本人情報 API が返す User.id と一覧の `userId` が一致する行だけ、名前の横に「（自分）」を表示する。ProjectMember.id は本人判定に使わない。

権限変更は Dialog ではなく、対象の行・カード内で行う。owner にだけ操作列と「権限変更」を表示し、対象の role が owner の場合は操作を表示しない。
PC は権限セルを選択欄・「保存」「取消」に切り替える。モバイルは編集中の権限バッジを隠し、カード下部の淡い背景の領域に同じ編集欄を表示する。
編集開始時は対象の現在の role を選択し、選択肢は「メンバー」「閲覧者」の2つとする。編集対象は1人とし、PC・モバイルで対象と選択値を共有する。
「取消」は選択を破棄して元の表示に戻し、再度編集すると保存済みの role を初期選択にする。アーカイブ済み Project では入口を無効にして理由を表示する。
「保存」で初めて入力を検証し、member・viewer のみを許可する。その後は入力変更時に再検証し、blur では検証しない。項目エラーは選択欄の下に表示する。
保存時は対象 Project の ID と ProjectMember.id、選択した role を既存の権限変更 API に送る。同じ role も API に送信し、成功として扱う。
送信中は「保存中...」を表示し、PC・モバイル両方の選択欄・保存・取消と、他のメンバーの「権限変更」を無効にする。通常操作による二重送信と、送信中の対象切り替え・編集終了を防ぐ。
成功時は「メンバーの権限を変更しました」と通知し、フォームを初期化して編集を終了する。`router.refresh()` で一覧を再取得し、バッジ・件数・並び順を API の結果に合わせる。権限変更だけでは行の位置を変えない。
失敗時は編集対象と選択値を保持し、編集欄に API の業務エラーを表示する。404・409 は複数の理由があるため、status だけで項目エラーへ変換しない。通信エラーなどは固定の案内を表示し、選択変更・再送信・取消ができる。取消や別の対象への切り替えで入力値とエラーを初期化する。

削除の入口は、owner にだけ表示する各行・カードの「権限変更」の隣に置く。対象が owner の場合と、その対象の権限編集中は表示しない。アーカイブ済み・権限変更の保存中・削除中は無効にする。
「削除」を押すと、対象の名前・メールと、ユーザーアカウントは削除されない案内を確認 Dialog に表示する。名前が未設定・空白だけの場合は「名前未設定」とする。PC は中央、モバイルは下寄せとし、画面幅を切り替えても同じ対象を共有する。
キャンセル・閉じるボタン・Escape キーで閉じ、入口の削除ボタンにフォーカスを戻す。閉じるだけでは一覧の件数・メンバーを変更しない。
Dialog 内の「削除」で、対象 Project の ID と一覧の ProjectMember.id を既存の DELETE API に送る。送信中は「削除中...」を表示し、削除・キャンセル・閉じるボタンを無効にして Escape キーでも閉じない。PC・モバイル両方の権限変更・削除の入口と、開いている権限編集欄も無効にし、通常操作による二重送信と対象の切り替えを防ぐ。
成功時は本文のない204を扱い、「メンバーを削除しました」と通知して Dialog を閉じる。`router.refresh()` で一覧を再取得し、件数・並び順は API の配列に従う。手元で一覧の配列を削除する処理は持たない。
失敗時は Dialog と対象を保持し、API の業務エラーを Dialog 内に表示する。404・409 は複数の理由があるため、status だけで原因を決めない。通信エラーなどは固定の案内を表示する。送信中の制限を解除し、再試行やキャンセルを許可する。再試行・閉じる操作・次の対象の選択時に前回のエラーを消す。

取得中はヘッダー・タブ・一覧のスケルトンと、読み込み中の案内を表示する。成功時の空配列は「0名」「メンバーはいません。」と表示する。
Project 詳細またはメンバー一覧の取得で API が404を返した場合は、`notFound()` により404画面を表示する。
401・403を含む取得失敗やセッション・本人情報の取得失敗は、共通の「メンバー情報を取得できませんでした」という案内と、再試行・プロジェクト一覧へ戻る導線を表示する。
再試行はページのデータを再取得し、成功したら一覧へ復旧する。内部エラーの詳細をそのまま画面に表示しない。

Project 詳細のタブはページ移動のリンクとして扱い、表示対象を URL に保存する。

| 表示対象 | URL |
| --- | --- |
| タスク | `/projects/[projectId]/tasks` |
| メンバー | `/projects/[projectId]/members` |
| 設定 | `/projects/[projectId]/setting` |

直リンク・再読み込み・ブラウザーの戻る／進むでも URL に対応する表示を復元する。
選択中のリンクには `aria-current="page"` を付ける。
設定リンクは Project 詳細 API の `currentUserRole` が owner の場合だけ表示する。
member・viewer が設定 URL を直接開いた場合も設定フォームを表示せず、タスク URL へ戻す。
Project の入口 URL `/projects/[projectId]` は、タスク一覧 URL へ転送する。
各タブは別々の `page.tsx` と `loading.tsx` を持つ。タスクは一覧の行・カード、設定は入力フォームとアーカイブ欄のスケルトンを表示する。
アーカイブ・解除の成功後は、設定 URL をタスク URL に置き換える。
アーカイブ確認 Dialog は、送信中にキャンセル・閉じるボタンを無効にし、Escape キーでも閉じない。失敗時はエラーを表示し、閉じる操作を再び許可する。

登録画面は名前・メールアドレス・パスワード・確認用パスワードを受け付ける。
名前とメールアドレスは trim し、パスワードは8文字以上・確認用との一致を検証する。
Supabase へ送るのはメールアドレス・パスワードと、`user_metadata.name` に保存する名前である。
メール確認が必要な設定では、登録後に確認メールを開く案内を表示する。

`GET /confirm` は `token_hash` と `type=email` を受け取り、Supabase の `verifyOtp()` で検証する。
成功時はセッションを Cookie に保存して `/projects` へ `307` で移動する。
Supabase の検証エラー時は `/login?error=confirmation_failed` へ `307` で移動し、固定の案内を表示する。
確認情報がない場合や `type` が不正な場合は、Supabase を呼ばず `400` の JSON を返す。
移動先には `token_hash` や利用者指定のリダイレクト先を引き継がない。

未ログインで `/projects` またはその配下を開くと、Proxy が `/login` へ移動する。
ログイン画面自体はこのリダイレクトの対象にしない。
PC 幅ではサイドバー、`lg`（64rem / 通常1024px）未満では高さ48pxのヘッダーを表示する。
ヘッダーは左にハンバーガーメニュー、中央にロゴと `Bluemine`、右に名前の先頭文字のアイコンを置く。
右のアイコンには操作を持たせず、ハンバーガーメニューから Sheet を開く。
Sheet はプロジェクト一覧と各プロジェクトへのリンクを表示し、現在の項目を青色にする。
リンクを選ぶと遷移して Sheet を閉じる。リストはスクロール可能にし、ユーザーメニューを最下部に置く。
サイドバーと Sheet のユーザーメニューはログインユーザーの名前・メールアドレスを表示し、名前が `null` の場合は「ユーザー」と表示する。
ユーザーメニューのログアウトは現在のセッションを終了して `/login` へ移動する。
処理中は二重操作を防ぎ、失敗時はエラーと再試行できる状態を表示する。
Sheet を閉じてもログアウト処理中の状態とエラーを保持し、PC 幅へ切り替えると Sheet と小メニューを閉じる。

認証済みの Project 操作が使えるようになったら、Playwright でログインと Project の主要導線を確認し、既存の再利用 UI を Storybook に登録する。

### 段階3: タスク管理

| URL | 目的 |
| --- | --- |
| `/projects/[projectId]/tasks` | Project に属するタスク一覧を表示する |
| `/projects/[projectId]/tasks/new` | タスクを作成する |
| `/projects/[projectId]/tasks/[taskId]` | タスクを表示・編集する |

Task 一覧はタブ直下の全幅で表示し、上部の右側に件数を置く。Project ヘッダーにはキーと、本人の role の表示名を使った「オーナーとして参加中」などの案内を表示する。PC は番号・タイトル・状態・優先度・担当者・報告者・期限・更新日時の8列の表とする。表は最小幅56remを確保し、狭い画面では表の中で横スクロールできるようにする。`md`（48rem / 通常768px）未満は番号・タイトル・状態・優先度・担当者・報告者・期限のカードにする。番号は `Project.key` と `Task.number` を組み合わせ、番号とタイトルの両方を詳細ページへのリンクにする。開始日は詳細画面で確認する。日付は `YYYY/MM/DD`、更新日時は日本時間の日付で表示し、期限未設定は「—」とする。日本時間の今日より前が期限で、状態が `done` 以外の Task は、期限を赤色と警告アイコンで表示する。
担当者・報告者は名前と装飾用のアバターで表示する。担当者が `null` なら「未担当」、Userの名前が未設定・空白のみなら「名前未設定」とし、長い名前は折り返す。モバイルは番号をタイトルの上に置き、その下に優先度、担当者、報告者をそれぞれ別の行で表示する。担当者・報告者はラベル・アバター・名前の順に並べ、期限は優先度の行の右側に置く。loadingも8列の表と番号・担当者・報告者のあるカードの構成に合わせる。
一覧ヘッダーの作成リンクは、未アーカイブのProjectのowner・memberに表示し、`/projects/[projectId]/tasks/new`へ移動する。Taskが0件でも表示し、viewer・アーカイブ済みでは表示しない。`tasks/page.tsx`で表示条件とリンクを用意して`TaskList`の`headerAction`へ渡し、一覧側は受け取った操作を表示する。親子関係・絞り込みは後続とし、未実装の項目や操作を一覧に仮表示しない。

Task作成ページは`/projects/[projectId]/tasks/new`に置く。PCは基本情報を左、属性・日程・ボタンを右に配置し、モバイルは同じ順で縦に並べる。Project・本人・担当者候補の表示には既存のGET処理を再利用する。報告者は認証済み本人の名前、担当者候補は対象Projectの参加者を表示する。viewer・アーカイブ済みでは入力と作成ボタンを無効にする。
ステータス・優先度・担当者の選択欄は、既存のbase-nova設定に合わせたshadcn/uiのBase UI版Selectを使う。初期値は未着手・通常・担当者未選択とし、担当者は選択後に未選択へ戻せる。`items`で内部値と表示名を対応付け、User IDやenumの値をそのまま表示しない。
開始日・期限は、shadcn/uiのCalendarとPopoverを組み合わせた`TaskDateInput`を使う。日本語のカレンダーでそれぞれ1日を選択し、選択後は閉じて`YYYY/MM/DD`で表示する。初期値は未設定の「年 /月 /日」とし、選択後は「クリア」で未設定へ戻せる。内部値はUTCに変換せず`YYYY-MM-DD`の年月日を保持する。viewer・アーカイブ済みでは日付選択も無効にする。
フォームの入力管理・検証を追加した段階では、見出し・パンくずの`CreateTask`はServer Componentとし、`CreateTaskForm`をClient Componentに分ける。既存フォームと同じReact Hook FormとZodを使い、タイトルは前後の空白を除いた1〜200文字、説明は同様に5,000文字以内とする。ステータス・優先度は定義済みの値に限定する。日付はフォーム内ではDateまたはnullで保持し、年は0001〜9999、両方設定した場合は期限が開始日以降（同日も可）であることを確認する。初回送信後は、開始日・期限の変更・クリア時にも前後関係を再検証する。エラーは対象欄の下に表示し、入力欄と読み上げ用に関連付ける。初回は作成ボタン・Enterで送信したときに全項目を検証し、送信前のフォーカス移動や入力変更ではエラーを表示しない。送信後は入力変更時に再検証し、修正に合わせてエラーを更新する。作成ボタン・Enterで検証を通過した後、作成APIへ7項目だけを送信する。日付はUTCに変換せずYYYY-MM-DDにし、空の説明・未担当・未設定の日付はnullに揃える。番号・報告者・Project IDは本文へ含めない。送信中は「作成中...」を表示して入力・作成・キャンセルを無効にし、検証開始から成功後の移動まで二重送信を防ぐ。失敗時は入力値を保持し、作成ボタンの上にAPIの理由、通信失敗時は画面用の汎用メッセージを表示して再試行を許可する。成功時は返却されたTask IDで詳細ページへ移動し、画面を再取得する。キャンセルとパンくずは対象Projectのタスク一覧へ戻る。親タスクの選択欄は、親子関係を実装する後続の段階まで表示しない。予定工数は、ユーザー指定のデザインに合わせた表示のみであり、入力管理・検証・API送信の対象に含めない。初期データ取得中は作成画面用のスケルトンを表示し、取得失敗時は作成画面用の案内・再試行・対象Projectのタスク一覧へのリンクを表示する。Storybookでは作成APIをモックし、送信中・送信エラーも確認できる。

Task 詳細の閲覧ページは実装済みである。Project 詳細を取得した後、URL の Project ID・Task ID を使って詳細 API を呼び、詳細専用のヘッダーと Task のタイトル・説明・状態・優先度・担当者・報告者・開始日・期限・作成日時・更新日時を表示する。owner・member・viewer とアーカイブ済み Project でも閲覧できる。ヘッダーには「プロジェクト一覧 / Project 名 / APP-12」のパンくずを表示し、Project 名からその Project のタスク一覧へ戻れる。パンくずの末尾とページの見出しには `Project.key` と `Task.number` を組み合わせた番号を表示する。
タイトルと説明は同じ本文カード、その他の項目は「属性」カードにまとめる。PC は本文を左2列分・属性を右1列分に分け、`lg`（64rem / 通常1024px）未満では本文・属性の順に縦に並べる。説明が未設定なら「説明はありません。」、開始日・期限が未設定なら「未設定」と表示する。説明は HTML として解釈せず、改行を保った本文として表示する。開始日・期限は日付を変えず `YYYY/MM/DD`、作成・更新日時は日本時間の `YYYY/MM/DD HH:mm` で表示する。長い Project 名・タイトル・説明は折り返す。
担当者・報告者は属性の状態・優先度の下に名前を表示する。担当者が `null` なら「未担当」、Userは存在するが名前が未設定・空白のみなら「名前未設定」とする。報告者は必須であり、名前の未設定は許可する。長い名前は折り返し、PC・モバイルとも横にはみ出さないようにする。共通Task型・Storybook・テストデータはAPIの `number`・nullableな `assignee`・必須の `reporter` に揃える。
詳細の取得中は `tasks/[taskId]/loading.tsx` でヘッダー・本文・属性のスケルトンを表示する。本文と属性は取得後と同じくPCで左右、モバイルで縦に並べる。読み上げには「タスク詳細を読み込んでいます」と伝え、装飾のスケルトンは読み上げ対象から外す。
Project 詳細または Task 詳細 API の404は `notFound()` に渡す。それ以外の失敗は `tasks/[taskId]/error.tsx` で「タスク詳細を取得できませんでした」という固定の案内、再試行ボタン、対象Projectのタスク一覧へ戻るリンクを表示する。Client ComponentでURLのProject IDを `useParams()` から取得し、再試行にはNext.jsの `retry()` を使う。内部エラーの内容は画面へ表示しない。

詳細ヘッダーの「編集」は未アーカイブのowner・memberに表示する。640px以上ではパンくず・見出しの右側、狭い画面では下側に配置し、同じURL上で右側のSheetを開く。SheetはPCでは幅32rem、モバイルでは全幅とし、ヘッダー・フッターを残して本文だけをスクロールする。編集可能な場合は担当者候補として対象Projectの参加者を取得する。候補取得の404も`notFound()`に変換し、その他の失敗は詳細画面のエラー表示へ渡す。

編集フォームは保存済みTaskの7項目を初期値にする。説明のnullは空文字、未担当は空文字、日付は年月日を保ったDateまたはnullとして管理する。番号・報告者は入力に含めない。作成フォームと同じZodの文字数・enum・日付ルールを使い、初回は「変更を保存」・Enterで検証し、その後は入力変更時に項目エラーを更新する。開始日の変更・クリア時には期限も再検証する。エラーは入力欄と読み上げ用に関連付ける。保存時は初期値から変更した項目だけをPATCHし、変更がなければAPIを呼ばない。設定を解除した説明・担当者・日付はnull、日付を設定する場合はYYYY-MM-DDで送る。検証・保存中は入力・保存・キャンセル・閉じるボタンを無効にし、Escape・背景の選択でもSheetを閉じない。成功時はSheetを閉じて同じ詳細画面を再取得する。失敗時は入力とSheetを保持して保存エラーを表示し、再試行と閉じる操作を許可する。通常時にキャンセル・閉じるボタン・Escape・背景の選択で閉じると入力とエラーを破棄し、再表示時は最新のTaskから初期化する。

タスク一覧の取得に失敗した場合は `tasks/error.tsx` で「タスク一覧を取得できませんでした」と表示し、再試行ボタンとプロジェクト一覧へ戻るリンクを用意する。
再試行は Next.js の `retry()` でページのデータを再取得する。内部エラーの詳細は画面へ表示しない。
Project 詳細または Task 一覧 API の404は `notFound()` で扱い、取得成功時の空配列と区別する。

認証・権限を整えた Project に Task を追加し、Task の主要導線を Playwright に、再利用する Task UI を Storybook に追加する。

## 初期 UI のルール

- Next.js App Router と Tailwind CSS を使う。
- Button、Input、Select、Dialog、Table などは shadcn/ui を土台にする。
- `StatusBadge`、`PriorityBadge` のように、複数画面で使うアプリ固有の部品は `components/common` に置く。
- 再利用する UI 部品には Storybook の story を追加し、通常・長文・空・disabled などの状態を確認する。
- フォームには label と分かりやすいエラー表示を付ける。
- 削除・アーカイブ前には確認 Dialog を出す。
- 一覧には loading、empty、error の状態を用意する。
- desktop と mobile の両方を確認する。狭い画面では、表をカード表示に切り替えるか、重要な列だけを残す。

## API の共通ルール

- Base URL は `/api`、データ形式は JSON とする。
- 入力値は NestJS の DTO と `class-validator` で検証する。
- API は成功時に JSON を返す。`204 No Content` の場合は本文を返さない。失敗時は HTTP status code とエラー内容を返す。
- 段階2から、保護する API には `Authorization: Bearer <access token>` を付ける。
- API 側でも Project の閲覧・編集権限を確認する。
- DB のカラム名をそのまま画面の都合へ広げず、必要な形で response を返す。

エラー response の例:

```json
{
  "statusCode": 400,
  "message": "入力内容を確認してください",
  "errors": [
    {
      "field": "name",
      "message": "プロジェクト名は必須です"
    }
  ]
}
```

## 段階ごとの API

### 段階0: Health check

```text
GET /api/health
```

NestJS API が起動していることを確認するための endpoint である。

### 段階1: Projects

```text
GET    /api/projects
POST   /api/projects
GET    /api/projects/:projectId
PATCH  /api/projects/:projectId
POST   /api/projects/:projectId/archive
POST   /api/projects/:projectId/unarchive
```

`POST /api/projects` の入力例:

```json
{
  "name": "Task Management App",
  "key": "APP",
  "description": "タスク管理アプリ"
}
```

初期に扱うルール:

- `name` は前後の空白を除いた後、1〜100文字。保存時も前後の空白を除く
- `key` は英数字1〜20文字で、重複しない
- `description` は任意で2,000文字以内
- `POST /api/projects/:projectId/archive` は `isArchived` を `true` にする論理アーカイブ操作とする
- `POST /api/projects/:projectId/unarchive` は `isArchived` を `false` に戻す
- アーカイブ・解除の POST はリクエスト本文を持たず、成功時は更新後の Project を `200` で返す
- `DELETE /api/projects/:projectId` は将来の物理削除用とし、現時点では未実装
- 段階2から、作成は認証済みユーザーに限定し、作成者を owner にする
- 段階2から、一覧・詳細は ProjectMember に限定する
- 一覧は owner・member・viewer として参加している Project を作成日時の新しい順で返す。アーカイブ済みも含み、参加 Project がなければ `200` と空配列を返す
- 段階2から、更新・アーカイブ・解除は owner のみ許可する
- Projectを返すAPIは `id`・`ownerId`・`name`・`key`・`description`・`isArchived`・`createdAt`・`updatedAt` の8項目に限定し、詳細取得だけ本人の `currentUserRole` を追加する。採番用の `lastTaskNumber` は内部データとして返さない。
- 存在しない Project と非参加者による詳細・更新・アーカイブ・解除は、同じ `404` 応答で扱い、Project の存在を知らせない
- 参加者の member・viewer による更新・アーカイブ・解除は `403` を返す

#### Project 詳細: GET /api/projects/:projectId

対象 Project に参加する owner・member・viewer に、Project の情報と閲覧者自身の `currentUserRole` を返す。
`currentUserRole` は必須で、認証済みユーザーの対象 Project の ProjectMember.role から取得する。
`ownerId` との比較や、クライアントが指定したユーザー ID からは決めない。
アーカイブ済み Project でも、本人の現在の role を含めて取得できる。

成功時は `200` と次の形式のオブジェクトを返す。

```json
{
  "id": "cmua3r1ik00032ed8lasbg1jj",
  "ownerId": "11111111-1111-4111-8111-111111111111",
  "name": "Task Management App",
  "key": "APP",
  "description": "タスク管理アプリ",
  "isArchived": false,
  "createdAt": "2026-10-17T00:00:00.000Z",
  "updatedAt": "2026-10-17T00:00:00.000Z",
  "currentUserRole": "member"
}
```

| 項目 | 意味 |
| --- | --- |
| `ownerId` | Project 作成者の User ID。閲覧者自身の role を表す項目ではない |
| `currentUserRole` | 認証済みユーザー自身の対象 Project での role。`owner`・`member`・`viewer` のいずれか。null にはしない |

既存の Project 項目は維持し、取得に使った内部の `projectMembers` はレスポンスに含めない。
`currentUserRole` を追加するのは詳細取得だけであり、Project 一覧・作成・更新・アーカイブ・解除のレスポンスには含めない。

token の不備は `401`、確認済みメールアドレスがない場合は `403` とする。
Project 不在・非参加は従来と同じ `404` 本文で扱い、Project の情報や role は返さない。
Web は `currentUserRole` をタブや操作の表示制御に使うが、各 API はリクエストごとに membership・role を検証する。

### 段階2: Auth と Members

```text
GET    /api/auth/me
GET    /api/projects/:projectId/members
POST   /api/projects/:projectId/members
PATCH  /api/projects/:projectId/members/:memberId
DELETE /api/projects/:projectId/members/:memberId
```

- ログイン・登録そのものは Next.js から Supabase Auth を呼ぶ。
- NestJS は access token を検証し、アプリ側の User を取得または初回作成する。
- 共通 AuthGuard で User のメールアドレスと `user_metadata.name` の名前を同期する。名前は trim し、未設定・空白・文字列以外なら `null` にする。既存の名前も更新する。
- member の追加・削除・role変更は owner のみ許可する。owner 自身の削除・role変更は許可しない。

#### メンバー一覧: GET /api/projects/:projectId/members

指定した Project に owner・member・viewer として参加しているユーザーに、owner を含む全メンバーの一覧を返す。
アーカイブ済み Project も閲覧できる。返却項目と並び順は、閲覧者の role によって変えない。
認可には検証済み token で特定した User の ID と、対象 Project の本人の ProjectMember を使う。
`ownerId` や表示用の名前だけでは許可しない。

成功時は `200` と次の形式の配列を返す。

```json
[
  {
    "id": "cmua3r1ik00032ed8lasbg1jj",
    "userId": "11111111-1111-4111-8111-111111111111",
    "role": "owner",
    "createdAt": "2026-10-11T10:00:00.000Z",
    "user": {
      "name": "中村",
      "email": "owner@example.test"
    }
  }
]
```

| 項目 | 意味 |
| --- | --- |
| `id` | ProjectMember の ID。role 変更・削除 API の `memberId` に使う |
| `userId` | 参加している User の ID（UUID） |
| `role` | `owner`・`member`・`viewer` |
| `createdAt` | 参加日時（ProjectMember の作成日時）。ISO 8601 形式の文字列 |
| `user.name` | アプリ側 User に保存された表示名。未設定は `null` |
| `user.email` | アプリ側 User に保存されたメールアドレス |

並び順は次の優先順位とする。

1. `owner` を先頭にする。
2. その他のメンバーは、role にかかわらず参加日時の古い順。
3. 参加日時も同じなら、ProjectMember の ID の昇順。

`updatedAt` と member・viewer の違いは並び順に使わない。権限変更後も参加日時と ID を維持するため、他の参加情報に変更がなければ同じ位置に残る。

| 条件 | 応答 |
| --- | --- |
| 有効な token・確認済みメールアドレスを持つ参加者（owner・member・viewer） | `200`・メンバー一覧。アーカイブ済みも同じ |
| token なし・形式不正・無効 | `401` |
| token は有効だがメールアドレスが未設定・未確認 | `403` |
| 存在しない Project、または非参加者 | 同じ `404` 本文 |

存在しない Project と非参加者には、既存 Project API と同じ次の本文を返す。

```json
{
  "message": "プロジェクトが見つかりません",
  "error": "Not Found",
  "statusCode": 404
}
```

#### メンバー追加: POST /api/projects/:projectId/members

指定した Project の owner が、登録済みのアプリ側 User をメンバーとして追加する。
認可には AuthGuard が確認した実行者の User ID と、対象 Project の ProjectMember.role を使う。
追加対象は本文の email で検索し、取得した User.id を参加情報に保存する。

リクエスト本文:

```json
{
  "email": "member@example.test",
  "role": "member"
}
```

| 項目 | 入力ルール |
| --- | --- |
| `email` | 必須。メールアドレス形式を検証し、文字列の前後の空白を除く。大文字・小文字は変換せず、保存された User.email と完全一致で検索する |
| `role` | 必須。`member`・`viewer` のみ。`owner`・`manager`・その他の値は拒否する |

null・型が不正な値・定義外の項目も `400` で拒否する。本文に `userId`・`ownerId`・`projectId` は指定しない。
認証 → DTO 検証 → 実行者の membership・owner 確認 → アーカイブ確認 → 追加対象 User の取得・重複確認 → 保存時の Project 状態の再確認・メンバー追加の順で処理する。
本文が不正なら認証後に `400` を返す。追加対象 User の有無・参加状況は、実行者の認可後に判定する。

Supabase Auth の登録と、アプリ側 User の作成は別である。
アプリ側 User は、確認済みメールアドレスを持つ本人が、有効な token で AuthGuard を通る API を初めて呼んだときに作成される。
Supabase Auth だけに登録されているユーザーは追加できず、この追加 API で対象 User を作成・同期しない。

成功時は `201 Created` と、メンバー一覧の各要素と同じ形式の単一オブジェクトを返す。
role は指定した `member` または `viewer`、名前が未設定の場合は `null` とする。

```json
{
  "id": "cmua3r1ik00042ed8lasbg1jk",
  "userId": "22222222-2222-4222-8222-222222222222",
  "role": "member",
  "createdAt": "2026-10-13T01:00:00.000Z",
  "user": {
    "name": null,
    "email": "member@example.test"
  }
}
```

| 条件 | 応答 |
| --- | --- |
| 有効な token・確認済みメールを持つ owner が、未参加のアプリ側 User を非アーカイブ Project に追加 | `201`・追加したメンバー |
| token なし・形式不正・無効 | `401` |
| token は有効だがメールアドレスが未設定・未確認 | `403` |
| 本文の必須項目が未指定、形式・型・role が不正、または定義外の項目がある | `400` |
| 参加者の role が member・viewer | `403`・「プロジェクトに参加者を追加する権限がありません」 |
| 存在しない Project、または非参加者 | メンバー一覧と同じ `404` 本文・「プロジェクトが見つかりません」 |
| owner がアーカイブ済み Project に追加（事前確認後にアーカイブされた場合を含む） | `409`・「アーカイブ済みのプロジェクトにメンバーを追加できません」 |
| 追加対象のアプリ側 User が存在しない、またはメールの大文字・小文字が一致しない | `404`・「追加対象のユーザーが見つかりません」 |
| 追加対象が owner・member・viewer として既に参加している | `409`・「指定したユーザーはすでに参加しています」 |

上表の membership・業務ルールの応答は、DTO 検証を通過した本文に対するものである。
owner 自身の重複追加も `409` とし、既存の role を変更しない。
対象 User が別 Project に参加していても、追加先に未参加であれば追加できる。
同じ User を同じ Project に同時追加した場合も、複合 unique 制約で重複を防ぎ、保存時の該当する Prisma エラー `P2002` は `409` に変換する。

保存時は対象 Project の行をロックし、状態の再確認とメンバー保存を同じ transaction で行う。
アーカイブが先に保存された場合、追加は `409` となり、アーカイブ後の Project・ProjectMember の値と更新日時を変更しない。
追加が先に行ロックを取得した場合、アーカイブは追加の transaction が終わるまで待機し、メンバー保存後にアーカイブできる。
この場合、追加は `201`、アーカイブは `200` で成功する。DB の保存順を保証するものであり、HTTP レスポンスが届く順序は保証しない。
保存時に対象 Project が存在しなければ、既存と同じ `404` 本文を返す。

拒否された操作では Project・ProjectMember の値と更新日時を変更しない。
認証時に行う実行者の User プロフィール同期は、この不変性の対象に含めない。
メンバーの role 変更・削除 API は後続の節を参照する。Web の一覧・追加・権限変更・削除 UI は、APIへの接続と成功・失敗時の表示、成功後の一覧再取得まで実装済みである。

#### メンバーの role 変更: PATCH /api/projects/:projectId/members/:memberId

対象 Project の owner が、指定した参加情報の role を `member`・`viewer` に変更する。
実行者は AuthGuard が検証した User ID と対象 Project の ProjectMember.role で認可し、`ownerId` や表示用の名前だけで許可しない。

| パラメーター | 意味 |
| --- | --- |
| `projectId` | 操作する Project の ID |
| `memberId` | 変更対象の ProjectMember.id。メンバー一覧の各要素の `id` を使う。User.id とは異なる |

対象の検索・更新は、`projectId` と ProjectMember の ID の両方で限定する。
別 Project の `memberId` と存在しない `memberId` は、同じ対象404本文で扱う。
実行者が両方の Project の owner でも、別 Project の参加情報は変更できない。

リクエスト本文:

```json
{
  "role": "viewer"
}
```

`role` は必須で、`member`・`viewer` のみを受け付ける。
`owner`・`manager`・未知の値・null・型が不正な値は `400` とする。
role の前後の空白や大文字・小文字は変換せず、`" member "` や `"MEMBER"` も拒否する。
空の本文と定義外の項目も `400` とし、本文に `userId`・`ownerId`・`projectId`・`memberId`・`email` は指定しない。

判定順は次のとおりとする。

1. AuthGuard による token・メールの確認と、実行者の User の同期。
2. DTO による本文の検証。
3. 実行者の対象 Project の membership・owner 権限の確認。
4. Project のアーカイブ状態の確認。
5. 対象の Project 所属・存在と、対象が owner ではないことの確認。
6. transaction 内で Project 行をロックし、Project の存在・アーカイブ状態、対象の所属・存在・owner 保護を同じ順で再確認する。
7. ロック後の最新の role と比較し、同じなら更新せず、異なれば保存する。

成功時は `200 OK` と、一覧の各要素と同じ形式の単一メンバーを返す。
同じ role の指定も同じ成功形式とし、`updatedAt` はレスポンスに含めない。

```json
{
  "id": "cmua3r1ik00042ed8lasbg1jk",
  "userId": "22222222-2222-4222-8222-222222222222",
  "role": "viewer",
  "createdAt": "2026-10-13T01:00:00.000Z",
  "user": {
    "name": null,
    "email": "member@example.test"
  }
}
```

| 条件 | 応答 |
| --- | --- |
| owner が非アーカイブ Project 内の member・viewer の role を指定 | `200`・処理後のメンバー。同じ role なら更新しない |
| token なし・形式不正・無効 | 既存 AuthGuard の `401` |
| token は有効だがメールアドレスが未設定・未確認 | `403`・「確認済みのメールアドレスが必要です。」 |
| role の未指定・値や型の不正、または定義外の項目 | `400`・既存 ValidationPipe のエラー本文。`message` は配列 |
| 実行者が member・viewer | `403`・「プロジェクトのメンバーの role を変更する権限がありません」 |
| Project が存在しない、または実行者が非参加者 | 既存と同じ `404` 本文・「プロジェクトが見つかりません」 |
| Project がアーカイブ済み（保存時の再確認を含む） | `409`・「アーカイブ済みのプロジェクトではメンバーの role を変更できません」 |
| 指定 Project 内に対象が存在しない、別 Project の memberId、または User.id の指定 | `404`・「変更対象のメンバーが見つかりません」 |
| 対象の role が owner | `409`・「owner の role は変更できません」 |

本文が不正な場合は、認証後に membership・業務ルールの確認より先に `400` を返す。
本文が有効なら、非参加者はアーカイブ状態や対象の有無によらず Project の404、member・viewer は403となる。
owner によるアーカイブ済み Project の操作は、対象の不存在・owner 保護より先にアーカイブの409を返す。
変更先に `owner` を指定した場合は DTO の400、対象が owner で変更先が `member`・`viewer` の場合は owner 保護の409となる。

業務エラーは既存と同じ `message`・`error`・`statusCode` の形式とする。対象404の本文例:

```json
{
  "message": "変更対象のメンバーが見つかりません",
  "error": "Not Found",
  "statusCode": 404
}
```

保存時は `SELECT … FOR UPDATE` で対象 Project 行をロックし、再確認から保存完了まで同じ transaction を使う。
アーカイブの UPDATE が自動取得する行ロックと待ち合わせるため、アーカイブ API に追加の明示ロックは不要である。
アーカイブが先に保存された場合は、同じ role の指定でも409で拒否する。
role 変更が先に Project 行をロックした場合は、その transaction が終わるまでアーカイブが待ち、role 変更200・アーカイブ200で成功できる。

同じ参加情報を同時に変更する場合は、Project 行ロックの取得順に処理する。
後の処理は最新の role を読み直し、指定と同じなら UPDATE しない。異なれば後の指定を保存する。
各成功応答はそれぞれの処理時点のメンバーを返し、後続処理で role が変わる場合がある。
DB の保存順を保証するものであり、HTTP レスポンスの到着順は保証しない。

実際の変更では、対象 ProjectMember の role と更新日時だけを更新する。
Project と他の参加情報、対象の ID・userId・projectId・createdAt は維持する。
拒否時と同じ role による変更不要時は、Project・ProjectMember の値・更新日時を変更しない。
認証時の User プロフィール同期は、この不変性の対象に含めない。
メンバー削除は次節を参照する。

#### メンバー削除: DELETE /api/projects/:projectId/members/:memberId

指定した Project の owner が、その Project に属する member・viewer の参加情報を1件だけ削除する。
認可には AuthGuard が確認した実行者の User ID と、対象 Project の ProjectMember.role を使う。
`ownerId` が本人でも、対象 Project の参加情報がなければ許可しない。

| パラメーター | 意味 |
| --- | --- |
| `projectId` | 削除対象の参加情報が属する Project の ID |
| `memberId` | メンバー一覧の `id`（ProjectMember.id）。User.id とは異なる |

リクエスト本文は不要で、入力 DTO は持たない。本文が送られても削除処理では参照しない。
実行者の ID は本文から受け取らず、認証済みユーザーの ID を使う。

成功時は `204 No Content` を返す。本文は空であり、JSON オブジェクトや `null` は返さない。
対象 ProjectMember を物理削除し、対象のアプリ側 User と Supabase Auth アカウントは保持する。
Project と残った参加情報、同じ User の別 Project の参加情報の値・更新日時は変更しない。
対象Projectで、そのUserが担当するTaskは完了済みを含めて `assigneeId: null` にし、担当を解除したTaskの `updatedAt` を更新する。Task自体・状態・番号・本文・報告者は保持し、未担当・他のUserの担当・他ProjectのTaskは値も更新日時も変更しない。
担当解除と参加情報の削除は同じtransactionで行い、途中で失敗した場合は両方を取り消す。

判定順は次のとおりとする。

1. AuthGuard による token・メールの確認と、実行者の User の同期。
2. 実行者の対象 Project の membership・owner 権限の確認。
3. Project のアーカイブ状態の確認。
4. 対象の Project 所属・存在と、対象が owner ではないことの確認。
5. transaction 内で対象 Project 行を `SELECT … FOR UPDATE` によりロックする。
6. Project の存在・アーカイブ状態、対象の所属・存在・owner 保護を同じ順で再確認する。
7. 再取得したProjectMemberの `userId` と対象 `projectId` でTaskを限定し、担当者を `null` にする。
8. 同じtransaction内で `projectId` と `memberId` の両方で対象を限定し、その ProjectMember を削除する。

| 条件 | 応答 |
| --- | --- |
| owner が非アーカイブ Project 内の member・viewer を削除 | `204`・本文なし |
| token なし・形式不正・無効 | 既存 AuthGuard の `401` |
| token は有効だがメールアドレスが未設定・未確認 | `403`・「確認済みのメールアドレスが必要です。」 |
| 実行者が member・viewer | `403`・「プロジェクトのメンバーを削除する権限がありません」 |
| Project が存在しない、または実行者が非参加者 | 既存と同じ `404` 本文・「プロジェクトが見つかりません」 |
| Project がアーカイブ済み（保存時の再確認を含む） | `409`・「アーカイブ済みのプロジェクトではメンバーを削除できません」 |
| 指定 Project 内に対象が存在しない、別 Project の memberId、User.id、または削除済みの memberId | 同じ `404` 本文・「削除対象のメンバーが見つかりません」 |
| 対象の role が owner | `409`・「owner は削除できません」 |

非参加者はアーカイブ状態や対象の有無によらず Project の404、member・viewer は403となる。
owner によるアーカイブ済み Project の操作は、対象の不存在・owner 保護より先にアーカイブの409を返す。
対象不在の4ケースは、すべて同じ status・本文で扱う。削除済みの ID への再削除も成功にはしない。

業務エラーは既存と同じ `message`・`error`・`statusCode` の形式とする。対象404の本文:

```json
{
  "message": "削除対象のメンバーが見つかりません",
  "error": "Not Found",
  "statusCode": 404
}
```

Project 行のロックは、状態の再確認から削除完了まで同じ transaction 内で保持する。
アーカイブの UPDATE、role 変更、他の削除と保存順を揃え、待機後は最新の状態を確認する。

| 先に保存・Project 行ロックを取得した操作 | 後続操作と結果 |
| --- | --- |
| アーカイブが先に保存 | 削除は409。アーカイブ後の Project・参加情報の値と更新日時を維持する |
| 削除が先に Project 行をロック | アーカイブは削除完了まで待機。削除204・アーカイブ200となり、対象の参加情報がない状態でアーカイブされる |
| 同じ参加情報への削除が先に Project 行をロック | 後の削除は待機し、対象不在の404を返す。先の削除は204 |
| 同じ参加情報への role 変更が先に Project 行をロック | role 変更200で保存後、削除204でその参加情報を削除する |
| 削除が先に Project 行をロック | 同じ参加情報への role 変更は待機し、対象不在の404・「変更対象のメンバーが見つかりません」を返す。削除は204 |

DB の処理順を保証するものであり、HTTP レスポンスの到着順は保証しない。
role 変更の成功応答はその処理時点の参加情報を返し、後続の削除でその参加情報がなくなる場合がある。

削除後に同じ User を再追加すると、新しい ID を持つ ProjectMember を作成する。
古い memberId への削除は対象不在の404となり、新しい参加情報の role・値・更新日時を変更しない。

拒否時は Project・ProjectMember・Task の値・更新日時を変更しない。
認証時に行う実行者の User プロフィール同期は、この不変性の対象に含めない。
Web の一覧・追加・権限変更・削除 UI は、APIへの接続と成功・失敗時の表示、成功後の一覧再取得まで実装済みである。

### 段階3: Tasks

```text
GET    /api/projects/:projectId/tasks
POST   /api/projects/:projectId/tasks
GET    /api/projects/:projectId/tasks/:taskId
PATCH  /api/projects/:projectId/tasks/:taskId
DELETE /api/projects/:projectId/tasks/:taskId
```

Task の DB 定義と一覧 GET は PR #37、Web の一覧・空状態・loading・error は PR #38、詳細 GET は PR #41 で `develop` にマージ済みである。詳細Webと、PR #43の番号・担当者・報告者の追加もマージ済みである。`feat/phase-2/task-create-api` では作成POSTを追加する。作成画面・更新・削除は、後続の操作として追加する。

#### タスク一覧: GET /api/projects/:projectId/tasks

対象 Project に owner・member・viewer として参加するユーザーへ、その Project の Task を返す。アーカイブ済み Project も閲覧できる。
本人は AuthGuard が検証した token の User ID で特定し、URL の `projectId` と本人の User ID から ProjectMember を取得する。`ownerId` との比較や query の `userId` では許可しない。

リクエスト本文・入力 DTO は不要であり、検索・絞り込み・ページネーションは持たない。
認可後の Task 取得も URL の `projectId` で限定し、他の参加 Project の Task は含めない。
並び順は `createdAt` の降順、同じ日時なら `id` の降順とする。Task がなければ `200` と空配列 `[]` を返す。

成功時は `200` と次の形式の配列を返す。

```json
[
  {
    "id": "cmua3r1ik00042ed8lasbg1jk",
    "projectId": "cmua3r1ik00032ed8lasbg1jj",
    "number": 12,
    "title": "ログイン画面を作る",
    "description": null,
    "status": "todo",
    "priority": "normal",
    "assignee": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "山田太郎"
    },
    "reporter": {
      "id": "22222222-2222-4222-8222-222222222222",
      "name": "佐藤花子"
    },
    "startDate": "2026-10-26",
    "dueDate": null,
    "createdAt": "2026-10-26T08:00:00.000Z",
    "updatedAt": "2026-10-26T08:00:00.000Z"
  }
]
```

- 返却項目は上の13項目に限定する。`number` はProject内の整数の番号であり、`Project.key` と結合した表示文字列は含めない。
- `assignee` は `{ id, name }` または `null`、`reporter` は必須の `{ id, name }` とする。関連するUserからはID・名前だけを取得し、メールアドレス・プロフィールの他の項目・Project・参加情報は返さない。`assigneeId`・`reporterId` も別のキーとして重複して返さない。
- `description`・`assignee`・`startDate`・`dueDate` のキーは省略せず、未設定は `null` を返す。`reporter` は常にオブジェクトで返す。Userの名前が未設定でも、そのUserを表すオブジェクトは保持し、`name` を `null` とする。報告者がProjectから脱退しても、作成者の表示情報を返す。
- `startDate`・`dueDate` は時刻・タイムゾーンを付けない `YYYY-MM-DD` とする。`createdAt`・`updatedAt` は UTC の ISO 8601 文字列（例: `2026-10-26T08:00:00.000Z`）とする。
- 日付・日時の文字列変換は Controller で行い、`TaskResponseDto` は返却形式と Swagger の説明を定義する。
- status は `todo`・`in_progress`・`done`、priority は `low`・`normal`・`high` を返す。

| 条件 | 応答 |
| --- | --- |
| 対象 Project の owner・member・viewer | `200` と Task の配列。アーカイブ済みも閲覧可能 |
| 閲覧可能だが Task がない | `200` と `[]` |
| token なし・形式不正・無効 | 既存 AuthGuard / AuthService の `401` |
| token は有効だがメールアドレスが未設定・未確認 | `403`・「確認済みのメールアドレスが必要です。」 |
| Project が存在しない、または本人が非参加者 | 同じ `404`・「プロジェクトが見つかりません」 |

Project 不在・非参加者の404は、Project のアーカイブ状態や Task の有無によらず次の同じ本文とする。参加情報の削除後は、同じ token でも閲覧できない。

```json
{
  "message": "プロジェクトが見つかりません",
  "error": "Not Found",
  "statusCode": 404
}
```

一覧取得では Project・ProjectMember・Task の値と更新日時を変更しない。認証時の User プロフィール同期は、この不変性の対象に含めない。

#### タスク詳細: GET /api/projects/:projectId/tasks/:taskId

対象 Project に owner・member・viewer として参加するユーザーへ、その Project に属する Task を1件返す。アーカイブ済み Project も閲覧できる。
本人は AuthGuard が検証した token の User ID で特定し、URL の `projectId` と本人の User ID から ProjectMember を取得する。`ownerId` や query の `userId` だけでは許可しない。
参加情報はリクエストごとに確認し、削除後は同じ token でも取得できない。

リクエスト本文・入力 DTO は不要である。認証と本人の参加情報の確認後、Task を URL の `projectId` と `taskId` の両方で限定して取得する。
両方の Project に参加していても、別 Project の Task は取得できず、存在しない Task と同じ404で扱う。

成功時は `200` と次の形式の単一オブジェクトを返す。

```json
{
  "id": "cmua3r1ik00042ed8lasbg1jk",
  "projectId": "cmua3r1ik00032ed8lasbg1jj",
  "number": 12,
  "title": "ログイン画面を作る",
  "description": "メールアドレスとパスワードでログインする",
  "status": "in_progress",
  "priority": "high",
  "assignee": {
    "id": "11111111-1111-4111-8111-111111111111",
    "name": "山田太郎"
  },
  "reporter": {
    "id": "22222222-2222-4222-8222-222222222222",
    "name": "佐藤花子"
  },
  "startDate": "2026-10-29",
  "dueDate": "2026-11-02",
  "createdAt": "2026-10-28T15:00:00.123Z",
  "updatedAt": "2026-10-29T09:00:00.456Z"
}
```

返却項目は一覧の各要素と同じ13項目に限定する。`number`・`assignee`・`reporter` の形式・返却範囲も一覧と同じとし、UserのID・名前以外の関連データは含めない。
`description`・`assignee`・`startDate`・`dueDate` のキーは省略せず、未設定は `null` を返す。`reporter` は常にオブジェクトで返す。Userの名前が未設定の場合は `name: null` とする。
status・priority の候補も一覧と同じであり、開始日・期限は `YYYY-MM-DD`、作成・更新日時は UTC の ISO 8601 文字列とする。
既存の `TaskResponseDto` を使い、日付・日時の変換は Controller で行う。

| 条件 | 応答 |
| --- | --- |
| 対象 Project の owner・member・viewer が、その Project の Task を取得 | `200` と Task の単一オブジェクト。アーカイブ済みも閲覧可能 |
| token なし・形式不正・無効 | 既存 AuthGuard / AuthService の `401` |
| token は有効だがメールアドレスが未設定・未確認 | `403`・「確認済みのメールアドレスが必要です。」 |
| Project が存在しない、または本人が非参加者 | 一覧と同じ `404` 本文・「プロジェクトが見つかりません」 |
| 閲覧可能な Project 内に Task が存在しない、または別 Project の taskId | 同じ `404` 本文・「タスクが見つかりません」 |

Project の不在・非参加は Task の存在確認より先に判定し、Task の有無によらず Project の404を返す。
Task 不在・所属違いの本文は次のとおりとする。

```json
{
  "message": "タスクが見つかりません",
  "error": "Not Found",
  "statusCode": 404
}
```

詳細取得の成功・拒否で Project・ProjectMember・Task の値と更新日時を変更しない。認証時の User プロフィール同期は、この不変性の対象に含めない。

#### タスク作成: POST /api/projects/:projectId/tasks

対象Projectのowner・memberが作成できる。本人はAuthGuardが検証したtokenから特定し、`ownerId`だけを根拠に許可しない。viewerは閲覧だけに限定し、アーカイブ済みProjectへの作成を拒否する。

入力例:

```json
{
  "title": "ログイン画面を作る",
  "description": "メールアドレスとパスワードを入力できる画面を作成する",
  "status": "todo",
  "priority": "normal",
  "assigneeId": null,
  "startDate": "2026-09-20",
  "dueDate": "2026-09-25"
}
```

| 項目 | 入力ルール・省略時 |
| --- | --- |
| title | 必須の文字列。前後の空白を除いた後、1〜200文字。null・空文字・空白だけは不可 |
| description | 任意の文字列、前後の空白を除いた後、5,000文字以内。省略・null・空文字・空白だけは説明なしとしてnullに統一 |
| status | `todo`・`in_progress`・`done`。省略時は`todo`、nullは不可 |
| priority | `low`・`normal`・`high`。省略時は`normal`、nullは不可 |
| assigneeId | 同じProjectに参加するUserのUUID。roleはowner・member・viewerのいずれも指定可。省略・nullは未担当 |
| startDate・dueDate | 実在する日付を`YYYY-MM-DD`で指定する（年は0001〜9999）。時刻付き・型違い・空文字は不可。省略・nullは未設定。片方だけの指定は許可し、両方ある場合は期限が開始日以降であること（同日も可） |

本文はこの7項目だけを受け取る。`id`・`projectId`・`number`・`reporterId`・`userId`など、定義外の項目は400で拒否する。
所属ProjectはURLから設定し、報告者は認証済み本人の`User.id`を必ず保存する。

成功時は201と、詳細取得と同じ13項目の単一オブジェクトを返す。番号・担当者・報告者の返却範囲、null、日付・日時の形式も詳細と共通であり、関連Userのメールアドレスは含めない。

保存順とtransaction:

1. 認証とDTO検証の後、Serviceで本人の参加情報・owner/member権限、日付の前後関係を確認する。
2. Repositoryのtransaction内で対象Project行を`FOR UPDATE`でロックする。
3. ロック後の最新の本人の参加情報・role、アーカイブ状態、担当者の同じProjectへの参加を確認する。この順で判定し、非参加者にはProjectの404、viewerには403を返す。
4. `Project.lastTaskNumber`をDB上で1増加させ、その番号と本人のreporterIdでTaskを作成する。カウンター増加とTask作成は同じtransactionに含め、保存が失敗したら両方を取り消す。
5. 作成済みTaskの番号は変更せず、削除した番号も再利用しない。番号はProjectごとに1から始まり、同時作成もProjectロックとDBの`(projectId, number)`一意制約で重複を防ぐ。

メンバー削除・role変更・アーカイブとは同じProject行で順序を揃える。担当者の削除が先に保存されれば400、作成が先なら201で作成した後に削除処理がそのTaskの担当を解除する。作成者自身の脱退・viewerへの変更が先なら404・403となる。アーカイブが先なら409、作成が先なら保存完了後にアーカイブできる。HTTPレスポンスの到着順は保証しない。
報告者の参加情報が後から削除されてもUserへの参照は保持する。

| 条件 | 応答 |
| --- | --- |
| activeなProjectのowner・member、有効な入力 | `201`とTaskの単一オブジェクト |
| tokenなし・形式不正・無効 | 既存認証処理の`401` |
| メール未設定・未確認 | `403`・「確認済みのメールアドレスが必要です。」 |
| DTO入力不正・定義外の項目、または期限が開始日より前 | `400`。日付の前後関係は「期限は開始日以降の日付を指定してください」 |
| Project不在・非参加（保存時の再確認を含む） | 一覧・詳細と同じ`404`・「プロジェクトが見つかりません」 |
| 本人がviewer（保存時の再確認を含む） | `403`・「タスクを作成する権限がありません」 |
| Projectがアーカイブ済み | `409`・「アーカイブ済みのプロジェクトにはタスクを作成できません」 |
| 担当者のUser不在・非参加・別Projectだけに参加 | 同じ`400`・「担当者は同じプロジェクトの参加者を指定してください」 |
| 採番した番号が既存Taskと重複 | `409`・「タスク番号が競合しました」。カウンター更新も取り消す |

成功時はTaskを1件追加し、対象Projectの`lastTaskNumber`と`updatedAt`を更新する。他のProject・参加情報・既存Taskの値と更新日時は維持する。拒否時・保存失敗時はProject・参加情報・Taskの値と更新日時を変更しない。認証時のUserプロフィール同期は対象外である。
Studio等で手動作成したTaskはカウンターを更新しないため、導入前に各Projectのカウンターが最大番号以上であることを確認する。削除済み番号を再利用しないよう、カウンターを下げない。開発データの補正は承認を得て行い、APIで自動補正しない。

#### タスク更新: PATCH /api/projects/:projectId/tasks/:taskId

未アーカイブのProjectに参加するowner・memberが、そのProjectのTaskを更新できる。本人はAuthGuardが検証したtokenから特定する。viewerは更新できず、`ownerId`が本人でも参加情報がなければ許可しない。

入力例:

```json
{
  "status": "in_progress",
  "assigneeId": null,
  "dueDate": "2026-11-10"
}
```

本文は作成と同じ7項目だけを受け取るが、すべて任意であり、**省略した項目は現在値を維持する**。status・priorityを初期値に戻したり、担当者・日付を解除したりしない。

| 項目 | 指定した場合のルール |
| --- | --- |
| title | trim後1〜200文字。null・空文字・空白だけは不可 |
| description | trim後5,000文字以内。null・空文字・空白だけは説明を解除してnullにする |
| status | `todo`・`in_progress`・`done`。nullは不可 |
| priority | `low`・`normal`・`high`。nullは不可 |
| assigneeId | 同じProjectの参加者のUser UUID。owner・member・viewerのいずれも担当可能。nullは担当解除 |
| startDate・dueDate | 実在する`YYYY-MM-DD`、年0001〜9999。時刻付き・型違い・空文字は不可。nullはその日付を解除 |

本文なし・`{}`は400・「更新する項目を指定してください」とする。JSONオブジェクトでない本文も400で拒否する。
`id`・`projectId`・`number`・`reporterId`・`userId`・`createdAt`・`updatedAt`など、定義外の項目は400で拒否する。
日付を片方だけ変更する場合も、保存済みのもう片方と合わせて検証する。更新後に両方ある場合、期限は開始日以降である必要があり、同日も許可する。

成功時は200と、詳細取得と同じ13項目の単一Taskを返す。担当者・報告者はID・nullableな名前だけを公開し、日付・日時の形式も共通とする。正規化後に指定値がすべて同じなら、認可・アーカイブ・担当者・日付の確認後に200を返し、Taskの値と`updatedAt`を維持する。

保存時は同じtransaction内でProject行をロックし、最新の本人の参加資格・role、アーカイブ状態、Taskの所属、指定された担当者、更新後の日付を確認する。Taskの取得・更新はともにURLの`projectId`と`taskId`の両方で限定する。
Serviceの事前確認後に脱退・viewerへの変更・アーカイブが保存されても、ロック後の最新状態で拒否する。担当者削除が先に保存されれば担当設定を400で拒否し、更新が先なら後続の削除がそのTaskの担当を解除する。担当者を省略したPATCHは解除済みの担当者を戻さない。同じTaskの更新もロック順に指定項目だけを適用し、HTTPレスポンスの到着順は保証しない。

| 条件 | 応答 |
| --- | --- |
| 有効な更新・同じ値の指定 | `200`とTaskの単一オブジェクト |
| tokenなし・形式不正・無効 | 既存認証処理の`401` |
| メール未設定・未確認 | `403`・「確認済みのメールアドレスが必要です。」 |
| 入力不正・更新項目なし・定義外項目 | `400` |
| Project不在・非参加（保存時の再確認を含む） | `404`・「プロジェクトが見つかりません」 |
| 本人がviewer（保存時の再確認を含む） | `403`・「タスクを更新する権限がありません」 |
| Projectがアーカイブ済み | `409`・「アーカイブ済みのプロジェクトにはタスクを更新できません」 |
| Task不在・別ProjectのTask | 同じ`404`・「タスクが見つかりません」 |
| 担当者が不在・非参加・別Projectだけに参加 | 同じ`400`・「担当者は同じプロジェクトの参加者を指定してください」 |
| 更新後の期限が開始日より前 | `400`・「期限は開始日以降の日付を指定してください」 |

実際に値が変わる場合は対象Taskの指定項目と`updatedAt`だけを変更する。番号・報告者・所属Project・作成日時、他のTask・Project・参加情報の値と更新日時を維持し、採番カウンターも変更しない。報告者が脱退済みでも更新でき、そのUserへの参照を保持する。拒否・保存失敗時はProject・参加情報・Taskを変更しない。認証時のUserプロフィール同期は、この不変性の対象外である。

#### 後続の削除

- Taskの削除はownerだけに許可し、別の1操作として追加する。
- URLの`projectId`とTaskの所属Projectが一致しない場合は削除できない。

番号・担当者・報告者のデータルールは [DOMAIN_MODEL.md](./DOMAIN_MODEL.md) を参照する。

絞り込み、ページネーション、親子タスクは基本 CRUD の後に追加する。

## 後続段階の API

基本機能が完成した後に、必要性を確認して追加する。

```text
GET/POST/PATCH/DELETE /api/projects/:projectId/tasks/:taskId/comments
GET                    /api/projects/:projectId/tasks/:taskId/history
```

Task の filter、ページネーション、Task number、親子タスク、履歴の自動作成もこの段階で扱う。
