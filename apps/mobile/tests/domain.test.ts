import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHypothesis, type ObservationEpisode } from '../../../packages/domain/src/hypothesis/index.ts';
import type { HypothesisSpec } from '../../../packages/domain/src/hypothesis/spec.ts';

const spec: HypothesisSpec = {
  schemaVersion: '1', unit: 'response', scope: [{ field: 'context', operator: 'equals', value: 'free_time' }],
  cohorts: [{ key: 'low', conditions: [{ field: 'energy', operator: 'less_than_or_equal', value: 2 }] }, { key: 'high', conditions: [{ field: 'energy', operator: 'greater_than_or_equal', value: 3 }] }],
  outcome: { field: 'done', metric: 'binary_rate_difference', positiveValues: [true] },
  expectation: { relation: 'cohort_a_less_than_b', minimumEffect: 0.2 },
  evaluationPolicy: { captureModes: ['momentary_observation'], acceptedSources: ['user_confirmed'], minimumSamplesPerCohort: 3, maximumCohortRatio: 2, windowDays: 30, excludeLowCertainty: true, maximumMissingRate: 0.2 },
};
function episode(id: string, energy: number, done: boolean): ObservationEpisode { return { responseId: id, checkinId: `c_${id}`, capturedAt: new Date().toISOString(), captureMode: 'momentary_observation', values: { context: 'free_time', energy, done }, sources: { context: 'user_confirmed', energy: 'user_confirmed', done: 'user_confirmed' }, certainties: { context: 'high', energy: 'high', done: 'high' } }; }
test('mobile reuses deterministic comparison evaluator', () => { const result = evaluateHypothesis('h_mobile', spec, [episode('1', 1, true), episode('2', 1, true), episode('3', 1, true), episode('4', 4, false), episode('5', 4, false), episode('6', 4, false)], new Date().toISOString()); assert.equal(result.result, 'challenges'); });
