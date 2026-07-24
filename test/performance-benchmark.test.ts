import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { generateSyntheticDataset } from '../packages/domain/src/syntheticData.ts';

test('10k observation benchmark stays within the local MVP budget', () => {
  const startedAt = performance.now();
  const dataset = generateSyntheticDataset({ count: 10000, seed: 20260725 });
  const elapsedMs = performance.now() - startedAt;

  assert.equal(dataset.observations.length, 20000);
  assert.ok(elapsedMs < 5000, `synthetic generation took ${elapsedMs.toFixed(1)}ms`);
});
