# ADR-002: PCS APIステータスコード・エラー形式・冪等性

## 状態

提案

## 背景

PCSの `DELETE /v1/context-entries/:id` は物理削除ではなく、`status='archived'` への論理遷移である。append-only revisionsとprovenanceを守るため、一般的な物理DELETEの契約をそのまま適用しない。

## 決定

- アーカイブは冪等な状態遷移とし、同じIDへの再送で二重のrevisionやprovenanceを作らない。
- 対象不存在時に200を返すか404を返すかは、API契約として明示する。新規エンドポイントでは存在確認可能な場合は404を基本とする。
- 既にarchivedの対象は成功扱いにできるが、`archived: true` と現在状態を安定した形式で返す。
- エラー形式は `send(response, statusCode, body)` の既存境界に合わせ、機械可読な `code` を含める。
- 監査証跡・provenanceを削除・上書きしない。復元や訂正は新しいrevisionとして扱う。
- 非同期分析・実験処理は202と追跡可能な識別子を返し、投げっぱなしの200を新規契約にしない。

## 適用範囲

PCSのentries、analysis、experiment系API。MeTheoryの上流サービス契約とは別に管理する。
