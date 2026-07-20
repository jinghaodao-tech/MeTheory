import { buildEpisodes, evaluateHypothesis, type HypothesisEvaluation } from '../../domain';
import { dbPromise, newId } from '../db';
import { observationsForHypothesis } from './observationRepository';
import { latestHypothesis, hypothesisById } from './hypothesisRepository';
import { missingCheckinCount } from './checkinRepository';

export async function evaluateTrackingHypothesis(evaluatedAt = new Date().toISOString(), hypothesisId?: string | null): Promise<HypothesisEvaluation | null> {
  const hypothesis = hypothesisId ? await hypothesisById(hypothesisId) : await latestHypothesis();
  if (!hypothesis) return null;
  const rows = await observationsForHypothesis(hypothesis.id);
  const spec = JSON.parse(hypothesis.spec_json);
  const episodes = buildEpisodes(rows.map((row) => ({ responseId: row.response_id, checkinId: row.checkin_id, capturedAt: row.captured_at, captureMode: row.capture_mode, field: row.field, value: JSON.parse(row.value_json), certainty: row.certainty, source: row.source })));
  const evaluation = evaluateHypothesis(hypothesis.id, spec, episodes, evaluatedAt);
  const db = await dbPromise;
  const evaluationId = newId('eval');
  const missingCount = evaluation.cohortMetrics.reduce((sum, metric) => sum + metric.missingSamples, 0) + await missingCheckinCount(hypothesis.id);
  const excludedCount = evaluation.samples.filter((sample) => !sample.included).length;
  if (missingCount > 0) evaluation.dataQualityFlags.push('missing_checkin_response');
  await db.runAsync('INSERT INTO hypothesis_evaluations (id, hypothesis_id, hypothesis_spec_version, evaluator_version, evaluated_at, window_start, window_end, result, cohort_metrics_json, observed_effect, required_effect, data_quality_json, sample_size, missing_count, excluded_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', evaluationId, hypothesis.id, evaluation.hypothesisSpecVersion, evaluation.evaluatorVersion, evaluation.evaluatedAt, evaluation.windowStart, evaluation.windowEnd, evaluation.result, JSON.stringify(evaluation.cohortMetrics), evaluation.observedEffect, evaluation.requiredEffect, JSON.stringify(evaluation.dataQualityFlags), evaluation.samples.length, missingCount, excludedCount);
  for (const sample of evaluation.samples) await db.runAsync('INSERT INTO hypothesis_evaluation_samples (id, evaluation_id, response_id, cohort_key, included, outcome_json, exclusion_reason) VALUES (?, ?, ?, ?, ?, ?, ?)', newId('sample'), evaluationId, sample.responseId, sample.cohortKey, sample.included ? 1 : 0, JSON.stringify(sample.outcomeValue), sample.exclusionReason);
  return evaluation;
}
export async function listEvaluations() { return (await dbPromise).getAllAsync<any>('SELECT * FROM hypothesis_evaluations ORDER BY evaluated_at DESC'); }
export async function latestEvaluation() { return (await dbPromise).getFirstAsync<any>('SELECT * FROM hypothesis_evaluations ORDER BY evaluated_at DESC LIMIT 1'); }
export async function evaluationSamples(evaluationId: string) { return (await dbPromise).getAllAsync<any>('SELECT s.*, c.scheduled_at, c.kind, r.payload_json FROM hypothesis_evaluation_samples s JOIN responses r ON r.id = s.response_id JOIN checkins c ON c.id = r.checkin_id WHERE s.evaluation_id = ? ORDER BY c.scheduled_at DESC', evaluationId); }
