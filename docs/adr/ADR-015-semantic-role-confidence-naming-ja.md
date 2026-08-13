# ADR-015: 推論確信度の命名とDB列命名を切り分ける

## Context

`inferSemanticRole`(`packages/self-understanding/src/semanticRoles.ts`)は、固定の正規表現による許可リストでテンプレートフィールドに意味役割を割り当て、これまでその結果を`confidence: 0.9 | 0.4`と呼んでいました。これは統計的・モデル由来の確率ではなく、2値しか取らないヒューリスティックな重み(パターンに一致すれば0.9、一致せず「other」にフォールバックすれば0.4)です。`confidence`という名前のフィールドが実質2値しか取らないというのは、これを消費する将来のレビュアー・将来のUI・将来のAI文言生成層から見て、キャリブレーションされた確信度("90%確からしい")のように読めてしまいますが、実際にはそうではないし、そう意図されたこともありません。

別の問題として、`confidence`を含む2つのSQLite/Postgres列がすでに存在します: `entry_field_values.confidence`と`entry_template_fields.semantic_role_confidence`(`apps/api/src/db/migrate.ts`、`db/ts_mvp_schema.sql`、`db/postgresql_schema.sql`)。これらはEntry/Template APIの一部で、`apps/api/src/server.ts`は現在このAPI群を「廃止済み(Retired record API. Templates, entries, record privacy, and Markdown search belong to PCS.)」と明記しており、本リポジトリ内でこれらの列を読み書きする稼働中のルートは存在しません。すでに出荷済みのスキーマの列名を変更するのはマイグレーションであり、互換性・ロールバックのコストが伴います。それを、現在何にも接続されていない面のために行う理由はありません。

## Decision

命名問題を2つに分け、稼働中の側だけを今回解決します。

1. **DB列は変更しない。** `entry_field_values.confidence`と`entry_template_fields.semantic_role_confidence`は現状の名前のまま維持します。将来この廃止済みEntry/Template APIが復活する場合は、その作業に合わせて正式なマイグレーション(新規列の追加→二重読み取り期間→旧列の廃止)を行うべきであり、本ADRはそのマイグレーションを許可するものではありません。今日時点でこれらの列に依存する稼働中コードが無いため、その必要もありません。
2. **`SemanticRoleSuggestion.confidence`を`inferenceConfidence`に改名し、新たに`inferenceMethod: "pattern_match" | "fallback" | "none"`を追加する。** 曖昧な名前が実際に稼働していたのはここだけです。`inferSemanticRole`・`validateSemanticRoleSuggestion`・`semanticRoleNeedsConfirmation`すべてがこの型を読み書きしており、grepで確認した限り本リポジトリ内に`SemanticRoleSuggestion`を生成する箇所は他に存在しません。つまりこの型は実質的にルールベース推論専用であり、そのように命名することは行き過ぎではありません。素の`number`の代わりにブランド型`SemanticRoleConfidence`(`semanticRoleConfidence(value)`、`[0, 1]`の範囲外では例外を投げる)を導入し、0〜1という制約を検証関数任せではなく構築時点の不変条件にしました。

既存の`0.85`という確認閾値、`0.9`/`0.4`というヒューリスティック値、そして「確定済み/保存済みの役割は必ず推論より優先される」という挙動(`resolveSemanticRole`はすでに`input.confirmed`/`storedSource`で早期リターンしている)は変更していません。本ADRは命名と型付けの変更であり、方針の変更ではありません。

## Consequences

- `inferSemanticRole(...).confidence`はもう存在しません。呼び出し側は`.inferenceConfidence`を使い、必要に応じて生の数値ではなく`.inferenceMethod`で「パターン一致だったか」を分岐する必要があります。
- 将来UIやAI文言生成層がこの値を表示する場合、生の数値をパーセンテージとして出すのではなく`inferenceMethod`(例:「命名ルールに一致」「一致するルールなし」)を表示しなければなりません。この制約は型のドキュメントコメント自体に明記されているため、型と一緒に伝播します。
- 2つのDB列は`confidence`/`semantic_role_confidence`という名前のまま残り、単体で見れば引き続き曖昧ですが、実質的には不活性です。本リポジトリ内にこれらを読み書きする稼働中コードは今日時点で存在しません。この状態の正とする情報源は`docs/spec/v1-scope.md`と`server.ts`内の「Retired record API」コメントであり、本ADRではありません。

## Reversal

廃止済みのEntry/Template API面が復活しこれらのDB列が再び稼働する場合は、列名を直接変更するのではなく、正式なマイグレーション計画(追加的な新規列・二重読み取り・廃止期間)とあわせて本判断を再検討してください。この種の変更の扱いについては`docs/spec/v1-scope.md`の「Excluded」「Planned」の枠組みも参照してください。
