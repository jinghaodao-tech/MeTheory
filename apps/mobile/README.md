# MeTheory Mobile

MeTheoryのスマホ向けローカルファーストMVPです。既存のAPIを置き換えず、
Expo + React Native + TypeScriptで端末内の観察ループを提供します。

## MVP flow

`Self Belief -> Tracking Hypothesis -> App check-in -> Observation -> Deterministic Evaluation -> Evidence -> Provisional Self Model`

初回起動ではSelf Belief、観測対象、比較条件、結果指標を入力します。MVPは
`time_of_day_productivity`テンプレートからHypothesisSpecを生成し、Self Beliefとは
別レコードとして保存します。Check-inはTracking中Hypothesisに関連付けられ、回答時に
`time_period`をシステム生成してObservationを保存し、既存domain evaluatorで評価履歴を
作成します。Evidenceは比較結果、データ品質、各Check-in記録を表示し、Self Modelは
評価履歴から派生する暫定表示です。

## Structure

- `app/`: Expo Router screens
- `src/storage/`: SQLite schema, migration, repositories, app state
- `src/notifications/`: permission, random-window policy, and one-shot local scheduling
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
