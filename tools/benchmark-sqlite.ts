import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const sizes: Record<string, number> = { small: 10000, medium: 100000, large: 500000 };
const profile = process.argv[2] ?? 'small';
const count = sizes[profile] ?? Number(profile);
if (!Number.isInteger(count) || count <= 0) throw new Error('profile must be small, medium, large, or a positive row count');
const root = join(tmpdir(), `metheory-benchmark-${Date.now()}.sqlite3`);
const db = new DatabaseSync(root);
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; CREATE TABLE observation_episodes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, observed_at TEXT NOT NULL); CREATE TABLE parameter_values (id TEXT PRIMARY KEY, episode_id TEXT NOT NULL, parameter_id TEXT NOT NULL, number_value REAL, observed_at TEXT NOT NULL, is_missing INTEGER NOT NULL DEFAULT 0, FOREIGN KEY (episode_id) REFERENCES observation_episodes(id)); CREATE INDEX idx_episode_user_time ON observation_episodes(user_id, observed_at); CREATE INDEX idx_values_parameter_time ON parameter_values(parameter_id, observed_at); CREATE INDEX idx_values_episode ON parameter_values(episode_id); CREATE INDEX idx_values_observed_episode ON parameter_values(observed_at, episode_id, parameter_id);');
const started = performance.now();
db.exec('BEGIN');
const episodeInsert = db.prepare('INSERT INTO observation_episodes VALUES (?, ?, ?)');
const valueInsert = db.prepare('INSERT INTO parameter_values VALUES (?, ?, ?, ?, ?, ?)');
for (let index = 0; index < count; index += 1) { const episodeId = `episode_${index}`; const observedAt = new Date(Date.UTC(2026, 0, 1) + (index % 180) * 86400000).toISOString(); episodeInsert.run(episodeId, 'benchmark-user', observedAt); valueInsert.run(`value_${index}`, episodeId, `parameter_${index % 20}`, (index % 17 === 0 ? null : (index % 100) / 10), observedAt, index % 17 === 0 ? 1 : 0); }
db.exec('COMMIT');
const insertMs = performance.now() - started;
const queryStarted = performance.now();
const rows = db.prepare("SELECT pv.parameter_id, COUNT(*) AS sample_count, AVG(pv.number_value) AS mean FROM parameter_values pv JOIN observation_episodes oe ON oe.id=pv.episode_id WHERE oe.user_id=? AND pv.observed_at>=? AND pv.observed_at<? GROUP BY pv.parameter_id").all('benchmark-user', '2026-02-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');
const queryMs = performance.now() - queryStarted;
const plan = db.prepare("EXPLAIN QUERY PLAN SELECT pv.parameter_id FROM parameter_values pv JOIN observation_episodes oe ON oe.id=pv.episode_id WHERE oe.user_id=? AND pv.observed_at>=? AND pv.observed_at<?").all('benchmark-user', '2026-02-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');
const result = { profile, rows: count, insertMs: Math.round(insertMs * 100) / 100, aggregateQueryMs: Math.round(queryMs * 100) / 100, aggregateGroups: rows.length, explainQueryPlan: plan, generatedAt: new Date().toISOString() };
mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true }); writeFileSync(join(process.cwd(), 'artifacts', `benchmark-${profile}.json`), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
db.close(); rmSync(root, { force: true });
