import { dbPromise } from './db';
import { saveSelfBelief } from './repositories/selfBeliefRepository';
import { saveHypothesis } from './repositories/hypothesisRepository';
import { createManualDemoCheckin } from './services/checkinService';
import { saveResponseAndObservations } from './repositories/observationRepository';
import { checkinHypothesisId } from './repositories/checkinRepository';
import { evaluateTrackingHypothesis, listEvaluations, latestEvaluation, evaluationSamples } from './repositories/evaluationRepository';
import { setUserParameterSetting } from './repositories/parameterRepository';

export type HomeData = { belief: { statement: string } | null; hypothesis: { statement: string; state: string } | null; evaluations: number; recentCheckins: number };
export async function saveSetup(templateKey: string, memo?: string) { const { templateByKey } = await import('@/features/hypothesisTemplates'); const template = templateByKey(templateKey); const beliefId = await saveSelfBelief(template.selfBeliefStatement); await saveHypothesis(beliefId, template.key); const db = await dbPromise; const baseParameters = await db.getAllAsync<{ id: string }>("SELECT id FROM parameter_definitions WHERE is_active=1 AND parameter_layer='base'"); for (const parameter of baseParameters) await setUserParameterSetting({ userId: 'local-user', parameterId: parameter.id, collectionEnabled: true, cloudSyncEnabled: false, externalAiEnabled: false, rawValueAccessEnabled: false, enabledReason: 'base' }); for (const [key, value] of Object.entries({ onboarding_complete: true, template_key: template.key, template_memo: memo ?? '', external_ai_enabled: false, cloud_sync_enabled: false })) await db.runAsync('INSERT OR REPLACE INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)', key, JSON.stringify(value), new Date().toISOString()); }
export async function isOnboardingComplete() { const db = await dbPromise; const row = await db.getFirstAsync<{ value_json: string }>('SELECT value_json FROM app_settings WHERE key = ?', 'onboarding_complete'); return row?.value_json === 'true'; }
export async function getHomeData(): Promise<HomeData> { const db = await dbPromise; const belief = await db.getFirstAsync<{ statement: string }>('SELECT statement FROM self_beliefs ORDER BY created_at DESC LIMIT 1'); const hypothesis = await db.getFirstAsync<{ statement: string; state: string }>('SELECT statement, state FROM hypotheses ORDER BY created_at DESC LIMIT 1'); const evaluations = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM hypothesis_evaluations'); const recentCheckins = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM checkins WHERE scheduled_at >= datetime('now', '-7 days')"); return { belief: belief ?? null, hypothesis: hypothesis ?? null, evaluations: evaluations?.count ?? 0, recentCheckins: recentCheckins?.count ?? 0 }; }
export async function createCheckin() { return createManualDemoCheckin(); }
export async function saveResponse(checkinId: string, payload: Record<string, unknown>, missingReason?: string) { await saveResponseAndObservations(checkinId, payload, missingReason); return evaluateTrackingHypothesis(new Date().toISOString(), await checkinHypothesisId(checkinId)); }
export { listEvaluations, latestEvaluation, evaluationSamples };
export {
  getParameterDefinition, listParameterDefinitions, listAllowedValues,
  getParameterGovernance, searchParameterDefinitions, setParameterGovernance,
  getUserParameterSetting, setUserParameterSetting, createObservationEpisode,
  saveParameterValue, saveParameterValuesTransaction, getEpisodeValues,
  queryParameterValues, getHypothesisRequirements, getMissingHypothesisParameters,
  saveGeneratedQuestion, listGeneratedQuestions, generateQuestionsForHypothesis,
} from './repositories/parameterRepository';
export {
  generateHypothesisCandidatesForUser, listHypothesisCandidates,
  dismissHypothesisCandidate, adoptHypothesisCandidate, getHypothesisParameterNeeds,
  selectNextQuestionTargets,
} from './repositories/hypothesisCandidateRepository';
export {
  buildQuestionGenerationContext, validateGeneratedQuestion, generateQuestion,
  generateNextQuestions,
  getQuestionBudgetDecision,
} from './repositories/questionGenerationRepository';
export {
  sourceProviderRegistry, registerSourceAdapter, getSourceAdapter,
  listAvailableSourceProviders, registerParameterMapping, listParameterMappings,
  getSourcePermissionStatus, requestSourcePermission, planParameterImports,
  normalizeExternalRecord, saveImportedValuesTransaction, runParameterImport,
} from './repositories/sourceImportRepository';
export {
  getAiParameterAccessDecision, filterAiReadableParameters,
  queryAiParameterAggregates, getAiReadableHypotheses, getAiReadableSelfModel,
  exportAiSnapshot, saveAiAccessAuditLog, listAiAccessAuditLogs,
} from './repositories/aiAccessRepository';
