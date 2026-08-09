import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCohorts, calculateOutcomeMetric, generateHypothesisCandidates, generateHypothesisCandidatesWithAudit, normalizeCandidateGenerationConfig } from '../packages/domain/src/hypothesis/candidates.ts';
import { generateSyntheticDataset, SYNTHETIC_SCENARIOS, type SyntheticScenarioId } from '../packages/domain/src/syntheticData.ts';

const parameter = (id: string, valueType: string, condition: boolean, outcome: boolean, min = 1, max = 5) => ({ id, nameJa: id, valueType, minimumValue: min, maximumValue: max, usableAsCondition: condition, usableAsOutcome: outcome });
test('cohorts split boolean and numeric parameters', () => { assert.deepEqual(buildCohorts(parameter('x', 'boolean', true, false)).map((item) => item.key), ['true', 'false']); assert.deepEqual(buildCohorts(parameter('x', 'number', true, false)).map((item) => item.key), ['low', 'high']); });
test('integer midpoint assigns every value exactly once and uses the upper half boundary', () => { const cohorts = buildCohorts(parameter('x', 'integer', true, false, 1, 5)); const matches = [1, 2, 3, 4, 5].map((value) => cohorts.filter((cohort) => cohort.condition.type === 'range' && (cohort.condition.minimum === undefined || value >= cohort.condition.minimum) && (cohort.condition.maximum === undefined || value <= cohort.condition.maximum)).length); assert.deepEqual(matches, [1, 1, 1, 1, 1]); assert.equal(cohorts[0].condition.maximum, 2); assert.equal(cohorts[1].condition.minimum, 3); });
test('decimal midpoint is lower-exclusive and upper-inclusive', () => { const cohorts = buildCohorts(parameter('x', 'number', true, false, 0, 1)); const midpoint = 0.5; const matches = [0, 0.5, 1].map((value) => cohorts.filter((cohort) => cohort.condition.type === 'range' && (cohort.condition.minimum === undefined || (cohort.condition.minimumInclusive === false ? value > cohort.condition.minimum : value >= cohort.condition.minimum)) && (cohort.condition.maximum === undefined || (cohort.condition.maximumInclusive === false ? value < cohort.condition.maximum : value <= cohort.condition.maximum))).length); assert.deepEqual(matches, [1, 1, 1]); assert.equal(cohorts[0].condition.maximum, midpoint); assert.equal(cohorts[0].condition.maximumInclusive, false); assert.equal(cohorts[1].condition.minimumInclusive, true); });
test('continuous cohort strategies support observed medians and fixed thresholds', () => { const median = buildCohorts({ ...parameter('x', 'number', true, false, 0, 1440), cohortStrategy: 'observed_median', observedValues: [10, 20, 30, 40] }); assert.equal(median[0].condition.maximum, 25); assert.equal(median[1].condition.minimum, 25); const fixed = buildCohorts({ ...parameter('x', 'number', true, false, 0, 1440), cohortStrategy: 'fixed_threshold', cohortThreshold: 60 }); assert.equal(fixed[0].condition.maximum, 60); assert.equal(fixed[1].condition.minimum, 60); });
test('candidate audit separates sample, effect, balance, and missingness gate rejections', () => { const observations = Array.from({ length: 4 }, (_, index) => [{ episodeId: `gate-${index}`, parameterId: 'condition', value: index < 2, observedAt: '2026-07-24T00:00:00.000Z' }, { episodeId: `gate-${index}`, parameterId: 'outcome', value: index < 2 ? 5 : 1, observedAt: '2026-07-24T00:00:00.000Z' }]).flat(); const result = generateHypothesisCandidatesWithAudit({ parameters: [parameter('condition', 'boolean', true, false), parameter('outcome', 'number', false, true)], observations, now: '2026-07-24T12:00:00.000Z' }); assert.equal(result.audit.rejectedBySampleSize, 1); assert.equal(result.audit.rejectedByEffect, 0); assert.equal(result.audit.rejectedByBalance, 0); assert.equal(result.audit.rejectedByMissingRate, 0); });
test('outcome metrics exclude missing values and calculate means', () => { assert.equal(calculateOutcomeMetric([1, 3, null], parameter('x', 'number', false, true)).value, 2); assert.equal(calculateOutcomeMetric([true, false, null], parameter('x', 'boolean', false, true)).value, 0.5); });
test('choice outcome uses its declared positive values', () => { assert.equal(calculateOutcomeMetric(['started', 'completed', 'skipped'], { ...parameter('x', 'single_choice', false, true), positiveValues: ['completed'] }).value, 1 / 3); });
test('choice outcome without semantics is not evaluable', () => { assert.equal(calculateOutcomeMetric(['started', 'completed'], parameter('x', 'single_choice', false, true)).valid, 0); assert.equal(calculateOutcomeMetric(['low', 'high'], { ...parameter('x', 'single_choice', false, true), numericMapping: { low: 0, high: 1 } }).value, 0.5); });
test('empty numeric mappings keep numeric PCS outcomes testable', () => {
  const observations = Array.from({ length: 20 }, (_, index) => [
    { episodeId: `pcs-${index}`, parameterId: 'condition', value: index < 10 ? 2 : 4, observedAt: '2026-08-09T04:00:00.000Z' },
    { episodeId: `pcs-${index}`, parameterId: 'outcome', value: index < 10 ? 40 : 10, observedAt: '2026-08-09T04:00:00.000Z' }
  ]).flat();
  const parameters = [
    { ...parameter('condition', 'number', true, false, 1, 5), semanticRole: 'task_clarity', sourceKind: 'entry' as const, numericMapping: {}, orderedValues: [], positiveValues: [] },
    { ...parameter('outcome', 'number', false, true, 0, 60), semanticRole: 'start_delay', sourceKind: 'entry' as const, numericMapping: {}, orderedValues: [], positiveValues: [] }
  ];
  const candidates = generateHypothesisCandidates({ parameters, observations, now: '2026-08-15T00:00:00.000Z', config: { pairAllowlistVersion: 'candidate-pair-v1' } });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.pValue !== null, true);
});
test('candidate generation enforces sample and effect thresholds', () => { const observations = Array.from({ length: 12 }, (_, index) => ({ episodeId: `e${index}`, parameterId: index < 6 ? 'condition' : 'condition', value: index < 6, observedAt: '2026-07-24T00:00:00.000Z' })).flatMap((row, index) => [row, { episodeId: `e${index}`, parameterId: 'outcome', value: index < 6 ? 5 : 1, observedAt: row.observedAt }]); const candidates = generateHypothesisCandidates({ parameters: [parameter('condition', 'boolean', true, false), parameter('outcome', 'number', false, true)], observations, now: '2026-07-24T12:00:00.000Z' }); assert.equal(candidates.length, 1); assert.equal(candidates[0].relation, 'a_greater_than_b'); assert.equal(candidates[0].sampleBalance, 1); });
test('missing outcomes do not satisfy the valid cohort minimum', () => { const observations = Array.from({ length: 12 }, (_, index) => [{ episodeId: `missing-${index}`, parameterId: 'condition', value: index < 6, observedAt: '2026-07-24T00:00:00.000Z' }, { episodeId: `missing-${index}`, parameterId: 'outcome', value: index % 3 === 0 ? null : index < 6 ? 5 : 1, isMissing: index % 3 === 0, observedAt: '2026-07-24T00:00:00.000Z' }]).flat(); const candidates = generateHypothesisCandidates({ parameters: [parameter('condition', 'boolean', true, false), parameter('outcome', 'number', false, true)], observations, now: '2026-07-24T12:00:00.000Z' }); assert.equal(candidates.length, 0); });
test('candidate config cannot weaken the evidence floors', () => {
  const config = normalizeCandidateGenerationConfig({ minimumSamplesPerCohort: 0, minimumTotalSamples: 1, maximumMissingRate: 1, minimumNormalizedEffect: 0, minimumSampleBalance: 0, lookbackDays: 10_000, maximumCandidates: 10_000 });
  assert.deepEqual({ samples: config.minimumSamplesPerCohort, total: config.minimumTotalSamples, missing: config.maximumMissingRate, effect: config.minimumNormalizedEffect, balance: config.minimumSampleBalance, days: config.lookbackDays, candidates: config.maximumCandidates }, { samples: 3, total: 6, missing: 0.5, effect: 0.1, balance: 0.25, days: 365, candidates: 50 });
  const observations = Array.from({ length: 4 }, (_, index) => [
    { episodeId: `weak-${index}`, parameterId: 'condition', value: index < 2, observedAt: '2026-07-24T00:00:00.000Z' },
    { episodeId: `weak-${index}`, parameterId: 'outcome', value: index < 2 ? 5 : 1, observedAt: '2026-07-24T00:00:00.000Z' }
  ]).flat();
  assert.equal(generateHypothesisCandidates({ parameters: [parameter('condition', 'boolean', true, false), parameter('outcome', 'number', false, true)], observations, now: '2026-07-24T12:00:00.000Z', config: { minimumSamplesPerCohort: 1, minimumTotalSamples: 2, minimumNormalizedEffect: 0 } }).length, 0);
});

test('large numeric cohorts keep candidates through the Monte Carlo significance fallback', () => {
  const observations = Array.from({ length: 40 }, (_, index) => {
    const condition = index < 20;
    const outcome = condition ? 4 + (index % 4) * 0.05 : 1 + (index % 4) * 0.05;
    return [
      { episodeId: `large-${index}`, parameterId: 'condition', value: condition, observedAt: '2026-07-24T00:00:00.000Z' },
      { episodeId: `large-${index}`, parameterId: 'outcome', value: outcome, observedAt: '2026-07-24T00:00:00.000Z' }
    ];
  }).flat();
  const candidates = generateHypothesisCandidates({
    parameters: [parameter('condition', 'boolean', true, false), parameter('outcome', 'number', false, true)],
    observations,
    now: '2026-07-24T12:00:00.000Z'
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].significanceMethod, 'monte_carlo_permutation');
});
test('continuous effects use pooled standard deviation instead of the declared value range', () => {
  const build = (scale: number) => {
    const observations = Array.from({ length: 20 }, (_, index) => {
      const condition = index < 10;
      const base = condition ? 100 + (index % 5) * 2 : 80 + (index % 5) * 2;
      return [
        { episodeId: `scale-${scale}-${index}`, parameterId: 'condition', value: condition, observedAt: '2026-07-24T00:00:00.000Z' },
        { episodeId: `scale-${scale}-${index}`, parameterId: 'outcome', value: base * scale, observedAt: '2026-07-24T00:00:00.000Z' }
      ];
    }).flat();
    return generateHypothesisCandidates({
      parameters: [parameter('condition', 'boolean', true, false), parameter('outcome', 'number', false, true, 0, 1440 * scale)],
      observations,
      now: '2026-07-24T12:00:00.000Z'
    })[0];
  };
  const base = build(1);
  const scaled = build(10);
  assert.ok(base);
  assert.ok(scaled);
  assert.ok(Math.abs(base.normalizedEffect - scaled.normalizedEffect) < 1e-9);
});

test('candidate audit records the effect-qualified candidates removed by significance testing', () => {
  const valuesA = [2, 3, 5, 4, 2, 5];
  const valuesB = [4, 2, 1, 4, 1, 4];
  const observations = [...valuesA, ...valuesB].flatMap((value, index) => [
    { episodeId: `audit-${index}`, parameterId: 'condition', value: index < valuesA.length, observedAt: '2026-07-24T00:00:00.000Z' },
    { episodeId: `audit-${index}`, parameterId: 'outcome', value, observedAt: '2026-07-24T00:00:00.000Z' }
  ]);
  const result = generateHypothesisCandidatesWithAudit({
    parameters: [parameter('condition', 'boolean', true, false), parameter('outcome', 'number', false, true)],
    observations,
    now: '2026-07-24T12:00:00.000Z'
  });
  assert.equal(result.audit.preSignificanceCandidates, 1);
  assert.equal(result.audit.significanceRejectedCandidates, 1);
  assert.equal(result.audit.acceptedCandidatesBeforeLimit, 0);
  assert.equal(result.candidates.length, 0);
});

test('all synthetic scenario expectations are discriminative in the candidate pipeline', () => {
  const parameters = [parameter('condition', 'boolean', true, false), parameter('outcome', 'number', false, true)];
  for (const scenario of Object.keys(SYNTHETIC_SCENARIOS) as SyntheticScenarioId[]) {
    const dataset = generateSyntheticDataset({ scenario, count: 100, seed: 42, startAt: '2026-01-01T00:00:00.000Z' });
    const end = new Date(dataset.observations.at(-1)!.observedAt);
    end.setUTCHours(23, 59, 59, 999);
    const candidates = generateHypothesisCandidates({ parameters, observations: dataset.observations, now: end.toISOString(), config: { lookbackDays: 365 } });
    const expectation = SYNTHETIC_SCENARIOS[scenario];
    assert.equal(candidates.length > 0, expectation.candidateExpected, `${scenario} candidate expectation`);
    if (expectation.expectedRelation) assert.equal(candidates[0]?.relation, expectation.expectedRelation, `${scenario} relation expectation`);
    if (expectation.expectedStability) assert.equal(candidates[0]?.temporalStabilityStatus, expectation.expectedStability, `${scenario} stability expectation`);
  }
});
