export type BaselineSelfPerception = { id: string; source: "baseline_self_perception"; itemSetVersion: string; itemKey: string; originalItemReference?: string; statementJa: string; response: number; responseScale: { minimum: number; maximum: number }; recordedAt: string; userConfirmed: boolean; useForSelfUnderstanding: boolean; privacyLevel: "normal" };
export type BaselineItemMapping = {
  itemKey: string;
  construct: "task_initiation" | "task_continuation" | "social_load" | "recovery_conditions" | "attention_conditions";
  comparisonRoles: string[];
  direction: "higher_means_more" | "higher_means_less";
  comparisonMeaningJa: string;
  priority: number;
};
export const IPIP_BASELINE_ITEM_SET_VERSION = "ipip-inspired-baseline-ja-v1";
export const IPIP_BASELINE_ITEMS = [
  ["starting_tasks", "予定した作業を始めることが多い"], ["finishing_tasks", "始めた作業を最後まで続けることが多い"], ["social_energy", "人と過ごした後の自分の疲れ方に気づいている"], ["new_experiences", "新しいやり方を試すことが多い"], ["cooperation", "相手の事情を考えて行動することが多い"], ["planning", "先の予定を整理してから行動することが多い"], ["emotional_recovery", "気分が変化した後に回復のきっかけを見つけられる"], ["attention", "目の前の作業へ注意を戻すことが多い"], ["curiosity", "気になったことを調べて理解しようとする"], ["self_reflection", "自分の状態や行動を振り返る時間を取る"]
] as const;
export const BASELINE_ITEM_MAPPINGS: readonly BaselineItemMapping[] = [
  { itemKey: "starting_tasks", construct: "task_initiation", comparisonRoles: ["start_delay", "initiation_difficulty", "observed_behavior"], direction: "higher_means_more", comparisonMeaningJa: "作業を始める感覚と、日々の開始条件を並べて確認する", priority: 1 },
  { itemKey: "planning", construct: "task_initiation", comparisonRoles: ["task_clarity", "deadline_clarity", "start_delay"], direction: "higher_means_more", comparisonMeaningJa: "予定を整理する自己認識と、明確さ・開始遅れを並べて確認する", priority: 2 },
  { itemKey: "finishing_tasks", construct: "task_continuation", comparisonRoles: ["continuation_difficulty", "completion", "observed_behavior"], direction: "higher_means_more", comparisonMeaningJa: "続けやすさの自己認識と、完了・継続の記録を並べて確認する", priority: 1 },
  { itemKey: "social_energy", construct: "social_load", comparisonRoles: ["fatigue", "recovery", "social_intensity"], direction: "higher_means_more", comparisonMeaningJa: "対人活動後の感覚と、疲労・回復の記録を並べて確認する", priority: 1 },
  { itemKey: "emotional_recovery", construct: "recovery_conditions", comparisonRoles: ["recovery", "fatigue", "mood"], direction: "higher_means_more", comparisonMeaningJa: "回復の自己認識と、気分・疲労の変化を並べて確認する", priority: 1 },
  { itemKey: "attention", construct: "attention_conditions", comparisonRoles: ["focus", "continuation_difficulty"], direction: "higher_means_more", comparisonMeaningJa: "注意を戻す自己認識と、集中・継続の記録を並べて確認する", priority: 1 }
];
export function baselineItems() { return IPIP_BASELINE_ITEMS.map(([itemKey, statementJa]) => ({ itemKey, statementJa, itemSetVersion: IPIP_BASELINE_ITEM_SET_VERSION, responseScale: { minimum: 1, maximum: 5 }, source: "baseline_self_perception" as const, originalItemReference: "IPIP-inspired original paraphrase; not an official scale item" })); }
export function validateBaselineResponse(response: unknown) { return Number.isInteger(response) && Number(response) >= 1 && Number(response) <= 5; }
export function createBaselineResponse(input: { id: string; itemKey: string; response: number; recordedAt?: string; useForSelfUnderstanding?: boolean }): BaselineSelfPerception { const item = baselineItems().find((candidate) => candidate.itemKey === input.itemKey); if (!item || !validateBaselineResponse(input.response)) throw new Error("baseline_response_invalid"); return { ...item, id: input.id, response: input.response, recordedAt: input.recordedAt ?? new Date().toISOString(), userConfirmed: true, useForSelfUnderstanding: input.useForSelfUnderstanding ?? true, privacyLevel: "normal" }; }
