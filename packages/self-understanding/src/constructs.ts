import type { HypothesisCandidate } from "../../domain/src/hypothesis/candidates.ts";
import type { SelfUnderstandingSemanticRole } from "../../templates/src/semanticRoles.ts";

export const SELF_UNDERSTANDING_CONSTRUCT_KEYS = [
  "energy_level",
  "recovery_conditions",
  "task_initiation",
  "task_continuation",
  "attention_conditions",
  "motivation_conditions",
  "routine_stability",
  "decision_load",
  "social_load",
  "environment_fit",
  "uncertainty_load",
  "avoidance_pattern",
  "mood_conditions",
  "self_perception_gap",
  "state_dependent_tendency",
  "relatively_stable_tendency",
  "uncategorized"
] as const;

export type SelfUnderstandingConstructKey =
  (typeof SELF_UNDERSTANDING_CONSTRUCT_KEYS)[number];
export type SelfUnderstandingConstructDefinition = {
  key: SelfUnderstandingConstructKey;
  labelJa: string;
  descriptionJa: string;
  allowedConditionRoles: SelfUnderstandingSemanticRole[];
  allowedOutcomeRoles: SelfUnderstandingSemanticRole[];
  suggestedObservationRoles: SelfUnderstandingSemanticRole[];
  nonClinical: true;
};
export type TendencyScope =
  | "single_period_state"
  | "repeated_state_pattern"
  | "relatively_stable_candidate"
  | "unknown";
export type ConstructMappingRule = {
  conditionRoles: SelfUnderstandingSemanticRole[];
  outcomeRoles: SelfUnderstandingSemanticRole[];
  construct: SelfUnderstandingConstructKey;
  priority: number;
};
export type CandidateHistory = {
  candidateId: string;
  constructKey: SelfUnderstandingConstructKey;
  conditionRole: SelfUnderstandingSemanticRole;
  outcomeRole: SelfUnderstandingSemanticRole;
  relation: HypothesisCandidate["relation"];
  period: { startAt: string; endAt: string };
  completePairCount: number;
};

export const SELF_UNDERSTANDING_CONSTRUCT_CATALOG_VERSION = "construct-catalog-v1";
export const SELF_UNDERSTANDING_CONSTRUCT_CATALOG: ReadonlyArray<SelfUnderstandingConstructDefinition> = [
  { key: "energy_level", labelJa: "エネルギーが変わりやすい条件", descriptionJa: "睡眠、時間帯、活動などと主観的なエネルギーの関係を扱う。", allowedConditionRoles: ["sleep_duration", "sleep_quality", "time_of_day", "day_type", "social_context", "environment"], allowedOutcomeRoles: ["energy", "fatigue"], suggestedObservationRoles: ["sleep_duration", "energy", "fatigue"], nonClinical: true },
  { key: "recovery_conditions", labelJa: "回復しやすい条件", descriptionJa: "休息、睡眠、環境、活動後の回復感との関係を扱う。", allowedConditionRoles: ["sleep_duration", "sleep_quality", "environment", "social_context", "time_of_day"], allowedOutcomeRoles: ["recovery", "energy", "fatigue"], suggestedObservationRoles: ["recovery", "fatigue", "sleep_quality"], nonClinical: true },
  { key: "task_initiation", labelJa: "作業を始めやすい条件", descriptionJa: "作業の明確さ、締切、環境などと開始までの時間や開始時の負担との関係を扱う。", allowedConditionRoles: ["time_of_day", "deadline_clarity", "task_clarity", "environment", "sleep_quality", "social_context", "energy", "fatigue"], allowedOutcomeRoles: ["start_delay", "initiation_difficulty", "completion", "observed_behavior"], suggestedObservationRoles: ["task_clarity", "start_delay", "energy"], nonClinical: true },
  { key: "task_continuation", labelJa: "作業を続けやすい条件", descriptionJa: "集中、疲労、環境などと作業継続の難しさとの関係を扱う。", allowedConditionRoles: ["energy", "fatigue", "environment", "noise_level", "task_clarity"], allowedOutcomeRoles: ["continuation_difficulty", "completion", "observed_behavior"], suggestedObservationRoles: ["continuation_difficulty", "fatigue", "focus"], nonClinical: true },
  { key: "attention_conditions", labelJa: "集中しやすい条件", descriptionJa: "時間帯、環境、騒音、睡眠などと集中の記録との関係を扱う。", allowedConditionRoles: ["time_of_day", "environment", "noise_level", "sleep_duration", "sleep_quality", "social_context", "energy"], allowedOutcomeRoles: ["focus", "continuation_difficulty"], suggestedObservationRoles: ["focus", "environment", "noise_level"], nonClinical: true },
  { key: "motivation_conditions", labelJa: "取り組みやすさが変わる条件", descriptionJa: "明確さ、気分、エネルギーなどと取り組みやすさの関係を扱う。", allowedConditionRoles: ["mood", "energy", "task_clarity", "deadline_clarity"], allowedOutcomeRoles: ["initiation_difficulty", "avoidance", "completion"], suggestedObservationRoles: ["mood", "energy", "initiation_difficulty"], nonClinical: true },
  { key: "routine_stability", labelJa: "習慣の安定性", descriptionJa: "曜日、時間帯、環境と習慣の実行や完了の関係を扱う。", allowedConditionRoles: ["day_type", "time_of_day", "environment"], allowedOutcomeRoles: ["completion", "observed_behavior"], suggestedObservationRoles: ["day_type", "time_of_day", "completion"], nonClinical: true },
  { key: "decision_load", labelJa: "判断の多さによる負荷", descriptionJa: "判断回数や不確実さと疲労、集中、満足との関係を扱う。", allowedConditionRoles: ["decision_count", "uncertainty"], allowedOutcomeRoles: ["fatigue", "focus", "satisfaction", "energy"], suggestedObservationRoles: ["decision_count", "fatigue", "focus"], nonClinical: true },
  { key: "social_load", labelJa: "対人活動による負荷", descriptionJa: "人数や対人状況と疲労、回復、気分との関係を扱う。", allowedConditionRoles: ["social_intensity", "social_context"], allowedOutcomeRoles: ["fatigue", "recovery", "energy", "mood", "satisfaction"], suggestedObservationRoles: ["social_intensity", "fatigue", "recovery"], nonClinical: true },
  { key: "environment_fit", labelJa: "環境との相性", descriptionJa: "場所や騒音などの環境条件と集中、疲労、満足との関係を扱う。", allowedConditionRoles: ["environment", "noise_level"], allowedOutcomeRoles: ["focus", "fatigue", "satisfaction", "completion"], suggestedObservationRoles: ["environment", "noise_level", "focus"], nonClinical: true },
  { key: "uncertainty_load", labelJa: "不確実さによる負荷", descriptionJa: "予定や作業の不確実さと開始、疲労、回避の関係を扱う。", allowedConditionRoles: ["uncertainty", "task_clarity", "deadline_clarity"], allowedOutcomeRoles: ["fatigue", "start_delay", "initiation_difficulty", "avoidance"], suggestedObservationRoles: ["uncertainty", "fatigue", "start_delay"], nonClinical: true },
  { key: "avoidance_pattern", labelJa: "避けやすい状況", descriptionJa: "明確さ、負荷、環境などと回避や先延ばしの記録との関係を扱う。", allowedConditionRoles: ["task_clarity", "deadline_clarity", "uncertainty", "fatigue", "social_context"], allowedOutcomeRoles: ["avoidance", "start_delay", "initiation_difficulty"], suggestedObservationRoles: ["avoidance", "task_clarity", "fatigue"], nonClinical: true },
  { key: "mood_conditions", labelJa: "気分が変わりやすい条件", descriptionJa: "睡眠、活動、対人状況、環境などと気分の関係を扱う。", allowedConditionRoles: ["sleep_duration", "sleep_quality", "social_context", "environment", "day_type", "energy"], allowedOutcomeRoles: ["mood", "satisfaction"], suggestedObservationRoles: ["mood", "sleep_quality", "social_context"], nonClinical: true },
  { key: "self_perception_gap", labelJa: "自己評価と記録された行動の違い", descriptionJa: "本人の主観的な評価と、開始、継続、完了など記録された行動の一致や違いを扱う。", allowedConditionRoles: ["self_rating"], allowedOutcomeRoles: ["observed_behavior", "completion", "start_delay"], suggestedObservationRoles: ["self_rating", "observed_behavior", "completion"], nonClinical: true },
  { key: "state_dependent_tendency", labelJa: "状態によって変わる傾向", descriptionJa: "一時的な状態と行動や結果の関係を、固定的な特性とみなさずに扱う。", allowedConditionRoles: ["mood", "energy", "fatigue", "sleep_quality"], allowedOutcomeRoles: ["focus", "completion", "satisfaction", "start_delay"], suggestedObservationRoles: ["mood", "energy", "observed_behavior"], nonClinical: true },
  { key: "relatively_stable_tendency", labelJa: "複数期間で繰り返される傾向", descriptionJa: "複数期間で同じ方向に観察された条件付き傾向を扱う。人格や性格の断定ではない。", allowedConditionRoles: [], allowedOutcomeRoles: [], suggestedObservationRoles: [], nonClinical: true },
  { key: "uncategorized", labelJa: "未分類の自己理解候補", descriptionJa: "定義済みの観察概念へ安全に対応付けられない比較候補。", allowedConditionRoles: [], allowedOutcomeRoles: [], suggestedObservationRoles: [], nonClinical: true }
] as const;

export const CONSTRUCT_MAPPING_RULES: ReadonlyArray<ConstructMappingRule> = [
  { conditionRoles: ["self_rating"], outcomeRoles: ["observed_behavior", "completion", "start_delay"], construct: "self_perception_gap", priority: 100 },
  { conditionRoles: ["task_clarity", "deadline_clarity"], outcomeRoles: ["start_delay", "initiation_difficulty", "observed_behavior"], construct: "task_initiation", priority: 95 },
  { conditionRoles: ["social_intensity", "social_context"], outcomeRoles: ["fatigue", "recovery", "energy", "mood"], construct: "social_load", priority: 90 },
  { conditionRoles: ["environment", "noise_level"], outcomeRoles: ["focus", "fatigue", "satisfaction", "completion"], construct: "environment_fit", priority: 90 },
  { conditionRoles: ["decision_count"], outcomeRoles: ["fatigue", "focus", "energy"], construct: "decision_load", priority: 88 },
  { conditionRoles: ["uncertainty"], outcomeRoles: ["fatigue", "start_delay", "initiation_difficulty", "avoidance"], construct: "uncertainty_load", priority: 88 },
  { conditionRoles: ["task_clarity", "deadline_clarity", "uncertainty", "fatigue"], outcomeRoles: ["avoidance"], construct: "avoidance_pattern", priority: 86 },
  { conditionRoles: ["energy", "fatigue", "environment", "noise_level"], outcomeRoles: ["continuation_difficulty"], construct: "task_continuation", priority: 84 },
  { conditionRoles: ["time_of_day", "environment", "noise_level", "sleep_duration", "sleep_quality", "social_context"], outcomeRoles: ["focus"], construct: "attention_conditions", priority: 82 },
  { conditionRoles: ["sleep_duration", "sleep_quality", "environment", "social_context"], outcomeRoles: ["recovery"], construct: "recovery_conditions", priority: 81 },
  { conditionRoles: ["sleep_duration", "sleep_quality", "time_of_day", "day_type", "social_context"], outcomeRoles: ["energy", "fatigue"], construct: "energy_level", priority: 80 },
  { conditionRoles: ["sleep_duration", "sleep_quality", "social_context", "environment", "day_type"], outcomeRoles: ["mood", "satisfaction"], construct: "mood_conditions", priority: 78 },
  { conditionRoles: ["day_type", "time_of_day", "environment"], outcomeRoles: ["completion", "observed_behavior"], construct: "routine_stability", priority: 76 },
  { conditionRoles: ["mood", "energy", "fatigue", "sleep_quality"], outcomeRoles: ["focus", "completion", "satisfaction", "start_delay"], construct: "state_dependent_tendency", priority: 60 }
] as const;

const catalog = new Map(
  SELF_UNDERSTANDING_CONSTRUCT_CATALOG.map((definition) => [definition.key, definition])
);
const constructKeySet = new Set<string>(SELF_UNDERSTANDING_CONSTRUCT_KEYS);

export function isSelfUnderstandingConstructKey(
  value: unknown
): value is SelfUnderstandingConstructKey {
  return typeof value === "string" && constructKeySet.has(value);
}

export function getConstructDefinition(
  key: SelfUnderstandingConstructKey
): SelfUnderstandingConstructDefinition {
  return catalog.get(key) ?? catalog.get("uncategorized")!;
}

export function mapConstruct(
  conditionRole: SelfUnderstandingSemanticRole,
  outcomeRole: SelfUnderstandingSemanticRole
): SelfUnderstandingConstructDefinition {
  const rule = [...CONSTRUCT_MAPPING_RULES]
    .sort((left, right) => right.priority - left.priority)
    .find(
      (item) =>
        item.conditionRoles.includes(conditionRole) &&
        item.outcomeRoles.includes(outcomeRole)
    );
  return getConstructDefinition(rule?.construct ?? "uncategorized");
}

export function tendencyScopeFor(input: {
  current: CandidateHistory;
  history: CandidateHistory[];
}): { scope: TendencyScope; repeatedPeriodCount: number; totalSampleCount: number } {
  const relevant = input.history.filter(
    (item) =>
      item.constructKey === input.current.constructKey &&
      item.conditionRole === input.current.conditionRole &&
      item.outcomeRole === input.current.outcomeRole
  );
  const periods = [input.current, ...relevant].filter(
    (item, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.period.startAt === item.period.startAt &&
          candidate.period.endAt === item.period.endAt
      ) === index
  );
  const sameDirection = periods.filter(
    (item) => item.relation === input.current.relation
  );
  const hasConflict = periods.some(
    (item) =>
      item.relation !== input.current.relation &&
      item.relation !== "approximately_equal"
  );
  const totalSampleCount = sameDirection.reduce(
    (sum, item) => sum + item.completePairCount,
    0
  );
  if (hasConflict) {
    return { scope: "unknown", repeatedPeriodCount: sameDirection.length, totalSampleCount };
  }
  if (sameDirection.length >= 3 && totalSampleCount >= 24) {
    return {
      scope: "relatively_stable_candidate",
      repeatedPeriodCount: sameDirection.length,
      totalSampleCount
    };
  }
  if (sameDirection.length >= 2) {
    return {
      scope: "repeated_state_pattern",
      repeatedPeriodCount: sameDirection.length,
      totalSampleCount
    };
  }
  return {
    scope: "single_period_state",
    repeatedPeriodCount: 1,
    totalSampleCount
  };
}

export function tendencyScopeLabelJa(scope: TendencyScope): string {
  if (scope === "relatively_stable_candidate") return "複数期間で比較的安定した候補";
  if (scope === "repeated_state_pattern") return "複数期間で繰り返された状態的傾向";
  if (scope === "single_period_state") return "今回の期間で見られた状態的傾向";
  return "傾向の範囲は未確定";
}

export function alternativeExplanationsFor(
  constructKey: SelfUnderstandingConstructKey
): string[] {
  const byConstruct: Partial<Record<SelfUnderstandingConstructKey, string[]>> = {
    task_initiation: ["締切の有無", "疲労やエネルギー", "作業量"],
    social_load: ["予定時間", "予定変更", "休息の取りやすさ"],
    environment_fit: ["作業内容", "時間帯", "睡眠や疲労"],
    self_perception_gap: ["集中感と進捗量が別々に変化した可能性", "タスクの難易度"],
    recovery_conditions: ["睡眠", "活動時間", "直前の負荷"],
    attention_conditions: ["作業内容", "通知", "疲労"]
  };
  return byConstruct[constructKey] ?? ["時間帯", "予定の明確さ", "疲労や睡眠"];
}
