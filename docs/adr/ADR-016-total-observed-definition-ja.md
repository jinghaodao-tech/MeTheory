# ADR-016: PCS分析の比率計算で、total_observedにdev-paceの5状態すべてを含める

## 背景

`analyzePcsAnalysisSnapshot`(`packages/self-understanding/src/pcsSnapshotAnalysis.ts`)は、
このファイルが計算する唯一の相関分析の条件・結果変数である`ai_conversation_ratio`と
`deep_thinking_ratio`を、`ai_conversation_minutes`/`deep_thinking_minutes`をその日の
「観測された総時間」で割ることで導出している。

その「総時間」は(修正前は282〜285行目で)`active_minutes + idle_minutes + away_minutes`
のみで計算されていた。比率の分子に使っている2つのフィールドが、分母からは除外されている
状態だった。dev-pace自身の集計スクリプト(`tools/aggregate_activity.py`)は5状態すべてを
合計した本物の`total_observed_minutes`フィールドを既に生成しているが、PCSの`dev-pace-daily-v1`
テンプレートの取り込み契約(`apps/api/src/routes/content.ts:122`)は現状そのフィールドを
受け付けていない。そのためMeTheory側は、パイプラインを生き残った個々の状態別フィールドから
「総時間」を自前で再構成する必要があり、その再構成が不完全だった。

実際の影響: 集中(deep thinking)やAI対話が中心で、active/idle/awayがほとんど無い日は、
分母が不自然に小さくなるか、ゼロになる。`total = 0`になった日は`totals`配列から完全に
除外される(`total > 0`というフィルタ)。つまり、この分析が測ろうとしている対象(集中度・
AI対話の強度)そのものが強く出ている日ほど、静かに分析対象から落ちる可能性が高い、という
逆転した構造になっていた。

このリポジトリのどのテスト(`test/pcs-snapshot.test.ts`、`test/pcs-cross-repository.test.ts`、
`test/pcs-live-cross-repository.e2e.test.ts`)も`robustness`・`totalObservedDefinition`・
2つの導出比率フィールドのいずれにも触れておらず、合成データですら一度も検証されていなかった。

これは`docs/spec/analysis-limitations.md`に既に書かれている交絡の限界
(「dev-paceのAI対話時間と総観測時間は独立ではない」)とは別の問題である。あちらは
「独立でない2つの量を比較すること」自体の統計的な限界を開示したもの。本ADRが扱うのは、
その「総時間」という値自体の計算式が不完全だったという実装上の欠陥であり、公開済みの
方法論的限界ではない。

## 決定

`total_observed`の定義を、3状態ではなく5状態すべての合計 —
`active_minutes + ai_conversation_minutes + deep_thinking_minutes + idle_minutes + away_minutes`
— に変更する。

- `totals`は5つの生フィールドすべてを読み、合計する(既存のall-or-nothingな有効性チェックに合わせる)
- `PcsAnalysisResult`型と返り値オブジェクトの`totalObservedDefinition`を、新しい計算式を
  反映したリテラル文字列に更新する。将来この公開フィールドを読む誰かが、正しい定義を見られるようにする
- `total_observed_stratum`の短時間/長時間の中央値分割も、修正後のtotalで再計算する
  (以前の中央値は同じ不完全な合計から計算されていたため)

## 影響

- 以前はactive+idle+awayがたまたま0だったために除外されていた日(完全に集中していた日、
  一日中AI対話だった日)が、今回の修正でtotalが正の値になり、初めて相関・比率比較の
  出力に含まれるようになる
- `ai_conversation_ratio`と`deep_thinking_ratio`はすべての日で値が変わる(分母が増える)ため、
  旧計算式で算出済みの候補スコアや分析履歴の値は、新しい実行結果と直接比較できない。
  `self_understanding_analysis_history`/`pcs_analysis_runs`に既に保存されている行は
  そのまま保持する(ADR-004: 分析履歴の不変性)。本ADRはそれらを遡って書き換えるものではなく、
  今後の実行が計算する内容だけを変える
- `test/pcs-snapshot-robustness.test.ts`(新規)で、修正後の計算式と、これまで未検証だった
  除外の挙動の両方を、完全に集中していた日を明示的に含む合成データで固定する。将来の変更で
  不完全な分母が静かに再導入されても、テストが落ちるようにする

## 却下した代替案

MeTheory側で再構成するのではなく、dev-pace自身の`total_observed_minutes`フィールドを
PCSの契約経由で取り込む案。ソース側が自分で計算した総時間をそのまま信頼するという意味では
より「正直」な長期的解決策だが、PCSのテンプレート/`content.ts`の契約変更と、まだ下していない
`v1-scope.md`寄りの判断が必要になり、今回の修正の範囲を超える。MeTheoryが既に受け取っている
5つの構成要素から再計算する今回の対応は、PCS↔MeTheoryの契約に触れずに、実際の欠陥
(計算式が2カテゴリを静かに落としていたこと)そのものを直す。PCSの契約が別の理由で見直される
時が来たら、この代替案を再検討する。
