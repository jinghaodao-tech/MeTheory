# ADR-012: PCS V3機械計測境界

## 状態

承認済み、アダプター実装済み。

## 決定
MeTheoryはPCS V2とV3 Snapshotを分析境界で受け付ける。V3の`machine_measured`値には計測メタデータを必須とし、Provenanceを`system`へ対応付ける。`user_confirmed`は`user_confirmed`のまま保持する。

`packages/self-understanding/src/pcsSnapshotAnalysis.ts`のV3アダプターは、検証済みV3値を内部分析レコードへ明示的に変換する。Provenanceと`sourceTool`を保持するため、機械計測とユーザー確認値を区別でき、共通の測定定義に由来する交絡も表示できる。V2は互換性のため継続対応し、V3を取り込み時に暗黙のV2へ降格しない。

## 理由
確認モードは単なるレビュー済みフラグではなくEvidenceのProvenanceである。明示的なV3アダプターによって、機械計測値をユーザー確認値として誤表現せず、既存の候補エンジンで両方のSnapshotを分析できる。
