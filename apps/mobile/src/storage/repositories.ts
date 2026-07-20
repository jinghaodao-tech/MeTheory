import { dbPromise } from './db';
import { saveSelfBelief } from './repositories/selfBeliefRepository';
import { saveHypothesis, timeOfDaySpec } from './repositories/hypothesisRepository';
import { createManualDemoCheckin } from './services/checkinService';
import { saveResponseAndObservations } from './repositories/observationRepository';
import { checkinHypothesisId } from './repositories/checkinRepository';
import { evaluateTrackingHypothesis, listEvaluations, latestEvaluation, evaluationSamples } from './repositories/evaluationRepository';

export type HomeData = { belief: { statement: string } | null; hypothesis: { statement: string; state: string } | null; evaluations: number; recentCheckins: number };
export async function saveSetup(statement: string, target = '活動の生産性', comparison = 'day vs night', metric = 'started rate and completed rate') { const beliefId = await saveSelfBelief(statement); await saveHypothesis(beliefId, statement, timeOfDaySpec()); const db = await dbPromise; for (const [key, value] of Object.entries({ onboarding_complete: true, template_target: target, template_comparison: comparison, template_metric: metric })) await db.runAsync('INSERT OR REPLACE INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)', key, JSON.stringify(value), new Date().toISOString()); }
export async function isOnboardingComplete() { const db = await dbPromise; const row = await db.getFirstAsync<{ value_json: string }>('SELECT value_json FROM app_settings WHERE key = ?', 'onboarding_complete'); return row?.value_json === 'true'; }
export async function getHomeData(): Promise<HomeData> { const db = await dbPromise; const belief = await db.getFirstAsync<{ statement: string }>('SELECT statement FROM self_beliefs ORDER BY created_at DESC LIMIT 1'); const hypothesis = await db.getFirstAsync<{ statement: string; state: string }>('SELECT statement, state FROM hypotheses ORDER BY created_at DESC LIMIT 1'); const evaluations = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM hypothesis_evaluations'); const recentCheckins = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM checkins WHERE scheduled_at >= datetime('now', '-7 days')"); return { belief: belief ?? null, hypothesis: hypothesis ?? null, evaluations: evaluations?.count ?? 0, recentCheckins: recentCheckins?.count ?? 0 }; }
export async function createCheckin() { return createManualDemoCheckin(); }
export async function saveResponse(checkinId: string, payload: Record<string, unknown>, missingReason?: string) { await saveResponseAndObservations(checkinId, payload, missingReason); return evaluateTrackingHypothesis(new Date().toISOString(), await checkinHypothesisId(checkinId)); }
export { listEvaluations, latestEvaluation, evaluationSamples };
