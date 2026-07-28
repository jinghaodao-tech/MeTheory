export type SelfUnderstandingChartKind = "time_series" | "condition_comparison" | "evidence_timeline" | "self_perception_vs_behavior";
export type SelfUnderstandingChartModel = { kind: SelfUnderstandingChartKind; title: string; sampleCount: number; yAxis: { min: number; max: number; label: string }; series: Array<{ key: string; label: string; points: Array<{ recordedAt: string; value: number | null; entryId?: string }> }>; notes: string[] };
export function buildFixedChartModel(input: { kind: SelfUnderstandingChartKind; title: string; sampleCount: number; series: SelfUnderstandingChartModel["series"]; yAxis?: { min: number; max: number; label: string }; notes?: string[] }): SelfUnderstandingChartModel {
  if (!Number.isInteger(input.sampleCount) || input.sampleCount < 0) throw new Error("chart_sample_count_invalid");
  const yAxis = input.yAxis ?? { min: 0, max: 5, label: "観測値" };
  if (!(yAxis.max > yAxis.min)) throw new Error("chart_axis_invalid");
  return { kind: input.kind, title: input.title, sampleCount: input.sampleCount, yAxis, series: input.series.map((item) => ({ ...item, points: item.points.map((point) => ({ ...point, value: point.value === null ? null : Number.isFinite(point.value) ? point.value : null })) })), notes: [...new Set([...(input.notes ?? []), "欠損値は0として扱いません。支持と反する記録を別々に確認してください。"]) ] };
}
