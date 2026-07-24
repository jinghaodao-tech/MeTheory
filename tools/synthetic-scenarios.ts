import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateSyntheticDataset, SYNTHETIC_SCENARIOS, type SyntheticScenarioId } from '../packages/domain/src/syntheticData.ts';

const command = process.argv[2] ?? 'seed'; const output = join(process.cwd(), 'artifacts', 'synthetic-scenarios.json'); const ids = Object.keys(SYNTHETIC_SCENARIOS) as SyntheticScenarioId[];
if (command === 'reset') { rmSync(output, { force: true }); console.log('synthetic scenarios reset'); process.exit(0); }
if (command === 'seed') { mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true }); writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), scenarios: ids.map((scenario) => generateSyntheticDataset({ scenario, count: 100, seed: 20260725 })) }, null, 2)); console.log(output); process.exit(0); }
if (command === 'test') { const payload = JSON.parse(readFileSync(output, 'utf8')) as { scenarios: Array<{ scenario: SyntheticScenarioId; observations: unknown[]; expectation?: { candidateExpected: boolean } }> }; if (payload.scenarios.length !== ids.length || payload.scenarios.some((item) => !item.observations.length || !item.expectation)) throw new Error('synthetic scenario fixture is incomplete'); console.log(`synthetic scenarios passed: ${payload.scenarios.length}`); process.exit(0); }
throw new Error('usage: seed | test | reset');
