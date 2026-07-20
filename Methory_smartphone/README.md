# Methory Smartphone

MeTheoryのスマホ向けローカルファーストMVPです。既存のAPIを置き換えず、
Expo + React Native + TypeScriptで端末内の観察ループを提供します。

## MVP flow

`Self Belief -> Tracking Hypothesis -> App check-in -> Observation -> Evidence history`

初回起動でSelf Beliefを入力し、端末内SQLiteへHypothesisを保存します。ホームから
チェックインを開き、活動・開始・完了・エネルギーを記録できます。Evidence画面は
既存の評価履歴を表示し、設定からローカル通知を一度有効化できます。

## Structure

- `app/`: Expo Router screens
- `src/storage/`: SQLite schema, migration, repositories, app state
- `src/notifications/`: permission and daily local notification scheduling
- `src/domain/`: existing `packages/domain` and hypothesis evaluator re-exports
- `tests/`: pure-domain smoke tests

## Run

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd start
```

Expo GoでのSQLite/通知の動作はSDKと端末OSの組み合わせに依存します。通知の
実機確認では通知権限を許可してください。API接続、認証、クラウド同期、AI、
ストア配布はこのMVPの範囲外です。
