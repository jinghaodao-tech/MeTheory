export type CandidateParameter = { id: string; nameJa: string; valueType: string; minimumValue?: number | null; maximumValue?: number | null; positiveValues?: unknown[]; usableAsCondition: boolean; usableAsOutcome: boolean; active?: boolean };
export type CandidateObservation = { episodeId: string; parameterId: string; value: unknown; isMissing?: boolean; observedAt: string };
export type CohortRule = { key: string; labelJa: string; condition: { type: 'equals' | 'range' | 'in'; value?: boolean | string | number; minimum?: number; maximum?: number; values?: Array<string | number> } };
export type CandidateGenerationConfig = { minimumSamplesPerCohort: number; minimumTotalSamples: number; maximumMissingRate: number; minimumNormalizedEffect: number; minimumSampleBalance: number; lookbackDays: number; maximumCandidates: number };
export type CandidateScoreBreakdown = { effectScore: number; sampleSizeScore: number; balanceScore: number; stabilityScore: number; relevanceScore: number; noveltyScore: number; missingPenalty: number; qualityPenalty: number; totalScore: number };
export type HypothesisCandidate = { id: string; candidateType: 'condition_difference' | 'belief_mismatch'; conditionParameterId: string; outcomeParameterId: string; cohortA: { key: string; labelJa: string; sampleCount: number; validSampleCount: number; missingCount: number; metricValue: number }; cohortB: { key: string; labelJa: string; sampleCount: number; validSampleCount: number; missingCount: number; metricValue: number }; relation: 'a_greater_than_b' | 'a_less_than_b' | 'approximately_equal'; effectValue: number; normalizedEffect: number; sampleBalance: number; missingRate: number; temporalStability: number; candidateScore: number; scoreBreakdown: CandidateScoreBreakdown; supportingPeriod: { startAt: string; endAt: string }; alternativeExplanationParameterIds: string[]; generationVersion: string; generatedAt: string };
export const DEFAULT_CANDIDATE_CONFIG: CandidateGenerationConfig = { minimumSamplesPerCohort: 5, minimumTotalSamples: 12, maximumMissingRate: 0.35, minimumNormalizedEffect: 0.2, minimumSampleBalance: 0.3, lookbackDays: 30, maximumCandidates: 10 };

export function buildCohorts(parameter: CandidateParameter, allowedValues: Array<{ valueKey: string; labelJa: string }> = []): CohortRule[] {
  if (parameter.valueType === 'boolean') return [{ key: 'true', labelJa: 'True', condition: { type: 'equals', value: true } }, { key: 'false', labelJa: 'False', condition: { type: 'equals', value: false } }];
  if (parameter.valueType === 'single_choice') return allowedValues.slice(0, 2).map((item) => ({ key: item.valueKey, labelJa: item.labelJa, condition: { type: 'equals', value: item.valueKey } }));
  const minimum = parameter.minimumValue ?? 0;
  const maximum = parameter.maximumValue ?? minimum + 1;
  const midpoint = minimum + (maximum - minimum) / 2;
  const integerRange = Number.isInteger(minimum) && Number.isInteger(maximum);
  const split = integerRange ? Math.floor(midpoint) : midpoint;
  return [{ key: 'low', labelJa: 'Low', condition: { type: 'range', maximum: split } }, { key: 'high', labelJa: 'High', condition: { type: 'range', minimum: integerRange ? split + 1 : split } }];
}

function inRule(value: unknown, rule: CohortRule['condition']) { if (rule.type === 'equals') return value === rule.value; if (rule.type === 'in') return rule.values?.includes(value as never) ?? false; return typeof value === 'number' && (rule.minimum === undefined || value >= rule.minimum) && (rule.maximum === undefined || value <= rule.maximum); }
export function calculateOutcomeMetric(values: unknown[], outcome: CandidateParameter) { const valid = values.filter((value) => value !== null && value !== undefined && typeof value !== 'object'); if (!valid.length) return { value: 0, valid: 0 }; if (outcome.valueType === 'boolean' || outcome.valueType === 'single_choice') { const positiveValues = outcome.positiveValues ?? (outcome.valueType === 'boolean' ? [true] : ['completed', 'started']); return { value: valid.filter((value) => positiveValues.some((positive) => Object.is(value, positive))).length / valid.length, valid: valid.length }; } const numbers = valid.filter((value): value is number => typeof value === 'number'); return { value: numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0, valid: numbers.length }; }
function normalized(effect: number, outcome: CandidateParameter) { const range = (outcome.maximumValue ?? 0) - (outcome.minimumValue ?? 0); return range > 0 && !['boolean', 'single_choice'].includes(outcome.valueType) ? Math.abs(effect) / range : Math.abs(effect); }
function score(effect: number, sampleSize: number, balance: number, stability: number, missingRate: number, config: CandidateGenerationConfig): CandidateScoreBreakdown { const effectScore = Math.min(1, Math.abs(effect) / Math.max(config.minimumNormalizedEffect, 0.01)); const sampleSizeScore = Math.min(1, sampleSize / (config.minimumTotalSamples * 2)); const missingPenalty = Math.max(0, missingRate - 0.1) * 0.5; const qualityPenalty = balance < config.minimumSampleBalance ? 0.25 : 0; const totalScore = Math.max(0, Math.min(1, effectScore * 0.35 + sampleSizeScore * 0.2 + balance * 0.15 + stability * 0.15 + 0.05 - missingPenalty - qualityPenalty)); return { effectScore, sampleSizeScore, balanceScore: balance, stabilityScore: stability, relevanceScore: 0, noveltyScore: 0, missingPenalty, qualityPenalty, totalScore }; }

function periodEffect(rows: Array<{ condition: unknown; outcome: unknown; observedAt: string }>, cohorts: CohortRule[], outcome: CandidateParameter, start: Date, end: Date) {
  const values = cohorts.map((cohort) => rows.filter((row) => { const time = new Date(row.observedAt); return time >= start && time <= end && inRule(row.condition, cohort.condition); }).map((row) => row.outcome));
  const metrics = values.map((group) => calculateOutcomeMetric(group, outcome));
  return metrics[0].valid && metrics[1].valid ? metrics[0].value - metrics[1].value : null;
}

export function generateHypothesisCandidates(input: { parameters: CandidateParameter[]; observations: CandidateObservation[]; allowedValues?: Record<string, Array<{ valueKey: string; labelJa: string }>>; config?: Partial<CandidateGenerationConfig>; now?: string }): HypothesisCandidate[] {
  const config = { ...DEFAULT_CANDIDATE_CONFIG, ...input.config };
  const end = new Date(input.now ?? new Date().toISOString());
  const start = new Date(end.getTime() - config.lookbackDays * 86400000);
  const observations = input.observations.filter((item) => !item.isMissing && new Date(item.observedAt) >= start && new Date(item.observedAt) <= end);
  const byEpisode = new Map<string, Map<string, { value: unknown; observedAt: string }>>();
  for (const item of observations) { if (!byEpisode.has(item.episodeId)) byEpisode.set(item.episodeId, new Map()); byEpisode.get(item.episodeId)!.set(item.parameterId, { value: item.value, observedAt: item.observedAt }); }
  const result: HypothesisCandidate[] = [];
  const conditionParams = input.parameters.filter((item) => item.active !== false && item.usableAsCondition);
  const outcomeParams = input.parameters.filter((item) => item.active !== false && item.usableAsOutcome);
  for (const condition of conditionParams) for (const outcome of outcomeParams) {
    if (condition.id === outcome.id) continue;
    const cohorts = buildCohorts(condition, input.allowedValues?.[condition.id] ?? []); if (cohorts.length < 2) continue;
    const rows = [...byEpisode.values()].flatMap((values) => { const conditionValue = values.get(condition.id); const outcomeValue = values.get(outcome.id); return conditionValue && outcomeValue ? [{ condition: conditionValue.value, outcome: outcomeValue.value, observedAt: outcomeValue.observedAt }] : []; });
    const groups = cohorts.map((rule) => rows.filter((row) => inRule(row.condition, rule.condition)).map((row) => row.outcome));
    const sampleCounts = groups.map((group) => group.length); const metrics = groups.map((group) => calculateOutcomeMetric(group, outcome)); const missing = groups.reduce((sum, group, index) => sum + group.length - metrics[index].valid, 0); const total = sampleCounts[0] + sampleCounts[1];
    if (total < config.minimumTotalSamples || sampleCounts.some((count) => count < config.minimumSamplesPerCohort)) continue;
    const effect = metrics[0].value - metrics[1].value; const normalizedEffect = normalized(effect, outcome); const balance = Math.min(metrics[0].valid, metrics[1].valid) / Math.max(metrics[0].valid, metrics[1].valid, 1); const missingRate = total ? missing / total : 1;
    const firstEnd = new Date(start.getTime() + (end.getTime() - start.getTime()) / 2); const firstEffect = periodEffect(rows, cohorts, outcome, start, firstEnd); const secondEffect = periodEffect(rows, cohorts, outcome, new Date(firstEnd.getTime() + 1), end); const temporalStability = firstEffect === null || secondEffect === null ? 0 : Math.abs(firstEffect - secondEffect) <= Math.max(0.1, Math.abs(effect) * 0.75) && Math.sign(firstEffect) === Math.sign(secondEffect) ? 1 : 0;
    if (normalizedEffect < config.minimumNormalizedEffect || balance < config.minimumSampleBalance || missingRate > config.maximumMissingRate) continue;
    const breakdown = score(normalizedEffect, total, balance, temporalStability, missingRate, config); const relation = Math.abs(effect) < config.minimumNormalizedEffect ? 'approximately_equal' : effect > 0 ? 'a_greater_than_b' : 'a_less_than_b';
    result.push({ id: `candidate_${condition.id}_${outcome.id}_${cohorts[0].key}_${cohorts[1].key}`, candidateType: 'condition_difference', conditionParameterId: condition.id, outcomeParameterId: outcome.id, cohortA: { key: cohorts[0].key, labelJa: cohorts[0].labelJa, sampleCount: sampleCounts[0], validSampleCount: metrics[0].valid, missingCount: sampleCounts[0] - metrics[0].valid, metricValue: metrics[0].value }, cohortB: { key: cohorts[1].key, labelJa: cohorts[1].labelJa, sampleCount: sampleCounts[1], validSampleCount: metrics[1].valid, missingCount: sampleCounts[1] - metrics[1].valid, metricValue: metrics[1].value }, relation, effectValue: effect, normalizedEffect, sampleBalance: balance, missingRate, temporalStability, candidateScore: breakdown.totalScore, scoreBreakdown: breakdown, supportingPeriod: { startAt: start.toISOString(), endAt: end.toISOString() }, alternativeExplanationParameterIds: [], generationVersion: 'candidate-v2', generatedAt: end.toISOString() });
  }
  return result.sort((a, b) => b.candidateScore - a.candidateScore || a.id.localeCompare(b.id)).slice(0, config.maximumCandidates);
}
