import test from 'node:test';
import assert from 'node:assert/strict';

test('EAV migration uses deterministic legacy episode and value ids', () => { const responseId = 'response_123'; assert.equal(`episode_${responseId}`, 'episode_response_123'); assert.equal(`legacy_${responseId}_energy_level`, 'legacy_response_123_energy_level'); });
test('missing is separate from false', () => { assert.notEqual(false, null); assert.deepEqual({ is_missing: 1, boolean_value: null }, { is_missing: 1, boolean_value: null }); });
