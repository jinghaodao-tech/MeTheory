# MeTheory

MeTheoryは、PCSの確認済みデータから非臨床的な自己理解仮説を検証するローカルファーストのエンジンです。

## 役割

- 短い実験、観測、仮説、Evidence、Self Modelを管理
- 確定済みPCSスナップショットだけを分析
- 支持する記録と反証する記録を分けて表示
- 医学的・心理学的な診断や固定的な性格判定を行わない
- Markdown本文やPCSのSQLiteデータベースを直接読まない

## PCSとの連携

PCSがMarkdownの記録、テンプレート、Review、同意、共有範囲、削除を管理します。MeTheoryはprofile-scoped Integration APIから、利用目的に合う確認済みスナップショットだけを受け取ります。長い記録フローはPCSへテンプレート要求を送り、短い実験はMeTheory側で作成します。

PCSの契約は `packages/integration-contracts` で検証され、`applicability`、Provenance、プライバシー境界を含みます。

## 開発

```powershell
npm ci
npm run typecheck
npm run test:pcs-live-e2e
npm run verify
```

詳細は [README.md](README.md) と [docs/personal-context-studio-integration.md](docs/personal-context-studio-integration.md) を参照してください。

## PCS実データの分析

実際のPCS Markdown由来データを分析する場合は、PCSでReview済みの値を含むプロフィールを用意し、MeTheory APIを起動したあとに次のコマンドを実行します。

```powershell
npm.cmd run analyze:pcs -- --from=... --to=...
```

`--json`も利用できます。MeTheoryはMarkdown本文やPCS SQLiteを直接読まず、PCSの分析Snapshotだけを受け取ります。
