# ADR-009: 廃止されたPythonランタイムを削除する

## 決定
PythonのMVPランタイム、参照スキーマ、Python専用互換テストをアクティブなリポジトリから削除した。対象は`backend/core.py`、`backend/server.py`、`backend/__init__.py`、`db/mvp_schema.sql`、`tools/test_mvp.py`である。TypeScript Node API、`db/ts_mvp_schema.sql`、バージョン管理されたマイグレーションランナーだけをランタイム経路とする。

## 理由
MeTheoryは単一ユーザー向けのローカルファーストなTypeScript/Nodeアプリである。2つ目の実装を残すとスキーマと挙動がずれ、どの閾値やライフサイクルルールが正本か不明確になる。

## 互換性の境界
この変更では`observations`と`evidence_links`テーブルを削除しない。現行Node API、モバイル互換クライアント、既存SQLiteデータが引き続き使用するためである。将来削除する場合は、すべてのクライアントと保存データが現在のEAV・評価経路へ移行したことを証明する別マイグレーションが必要になる。

## 影響

- TypeScriptが唯一の実行可能なドメイン実装になる。
- 既存のSQLiteマイグレーション・データ保持テストが互換性の安全網として残る。
- Pythonは文書化された一度限りのリポジトリツールに限り使用できるが、ランタイムやドメインの参照実装ではない。
