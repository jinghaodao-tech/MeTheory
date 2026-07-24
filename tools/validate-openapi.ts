import { readFileSync } from 'node:fs';
const source = readFileSync('docs/openapi-ai.yaml', 'utf8');
for (const path of ['/v1/ai/parameters:', '/v1/ai/parameters/{parameterId}:', '/v1/ai/self-model:', '/v1/ai/hypotheses:', '/v1/ai/hypotheses/{id}:', '/v1/ai/hypotheses/{id}/evidence:', '/v1/ai/hypotheses/{id}/missing-parameters:', '/v1/ai/aggregates/query:', '/v1/ai/snapshot:']) if (!source.includes(path)) throw new Error(`missing OpenAPI path: ${path}`);
for (const name of ['AggregateQuery:', 'UserId:', 'ClientId:', 'ClientType:']) if (!source.includes(name)) throw new Error(`missing OpenAPI component: ${name}`);
console.log('OpenAPI contract checks passed');
