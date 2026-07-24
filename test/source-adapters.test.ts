import test from 'node:test';
import assert from 'node:assert/strict';
import { ManualImportAdapter, SourceProviderRegistry, SystemClockAdapter, TestFixtureAdapter, validateSourceFetchInput } from '../packages/domain/src/sourceAdapters.ts';

const input = { userId: 'u1', startAt: '2026-07-24T00:00:00.000Z', endAt: '2026-07-24T12:00:00.000Z', requestedParameterIds: ['time_period'], reason: 'user_requested' as const };
test('source registry registers and resolves adapters', () => { const registry = new SourceProviderRegistry(); const adapter = new TestFixtureAdapter([]); registry.register(adapter); assert.equal(registry.get('test_fixture'), adapter); assert.throws(() => registry.register(adapter), /provider_already_registered/); });
test('clock adapter creates deterministic normalized source records', async () => { const result = await new SystemClockAdapter().fetch(input); assert.equal(result.records.length, 1); assert.equal(result.records[0].providerKey, 'system_clock'); assert.ok(result.records[0].rawFields.time_period); });
test('manual import accepts only JSON arrays and validates periods', () => { assert.equal(ManualImportAdapter.parseJson('[]').length, 0); assert.throws(() => ManualImportAdapter.parseJson('{}'), /requires_array/); assert.throws(() => validateSourceFetchInput({ ...input, endAt: input.startAt }), /invalid_fetch_period/); });
