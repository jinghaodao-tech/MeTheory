import type { DatabaseSync } from "node:sqlite";
import {
  generateSelfUnderstanding,
  BASELINE_ITEM_MAPPINGS,
  buildFixedChartModel,
  type CandidateHistory,
  type UnderstandingRecord
} from "../../../packages/self-understanding/src/index.ts";
import {
  isSelfUnderstandingSemanticRole,
  inferSemanticRole,
  semanticRoleNeedsConfirmation,
  resolveSemanticRole,
  semanticGroupIdFor,
  type SelfUnderstandingSemanticRole
} from "../../../packages/templates/src/semanticRoles.ts";
import type { CandidateParameter } from "../../../packages/domain/src/hypothesis/candidates.ts";
import { localDateInTimeZone } from "../../../packages/domain/src/activitywatch.ts";

type Row = Record<string, unknown>;

function fieldValue(row: Row): unknown {
  if (Number(row.is_missing ?? 0) === 1) return null;
  if (row.boolean_value !== null && row.boolean_value !== undefined) {
    return Number(row.boolean_value) === 1;
  }
  if (row.integer_value !== null && row.integer_value !== undefined) {
    return Number(row.integer_value);
  }
  if (row.number_value !== null && row.number_value !== undefined) {
    return Number(row.number_value);
  }
  if (row.json_value !== null && row.json_value !== undefined) {
    try {
      return JSON.parse(String(row.json_value));
    } catch {
      return null;
    }
  }
  return (
    row.text_value ??
    row.date_value ??
    row.datetime_value ??
    row.duration_seconds ??
    null
  );
}

function candidateValueType(valueType: string) {
  if (valueType === "choice") return "single_choice";
  if (["integer", "number", "scale", "duration_seconds"].includes(valueType)) {
    return "number";
  }
  return valueType;
}

function storedOrInferredRole(row: Row): SelfUnderstandingSemanticRole {
  const stored = row.semantic_role;
  if (isSelfUnderstandingSemanticRole(stored)) {
    const suggestion = {
      fieldKey: String(row.field_key),
      semanticRole: stored,
      confidence: Number(row.semantic_role_confidence ?? 0),
      reasonJa: "保存済みの意味役割"
    };
    const confirmed = Number(row.semantic_role_confirmed ?? 0) === 1;
    if (
      confirmed ||
      !semanticRoleNeedsConfirmation({
        suggestion,
        sensitivity: String(row.sensitivity_level ?? "normal") as
          | "normal"
          | "sensitive"
          | "highly_sensitive"
      })
    ) {
      return stored;
    }
  }
  return inferSemanticRole({
    fieldKey: String(row.field_key),
    label: String(row.label ?? row.field_key),
    description: String(row.description ?? ""),
    templateTheme: String(row.template_theme ?? "")
  }).semanticRole;
}

export type ExcludedAnalysisField = {
  templateId: string;
  templateVersionId: string;
  fieldKey: string;
  label: string;
  reason: "semantic_role_confirmation_required" | "semantic_role_unknown" | "unsupported_value_type" | "sensitive_role_unapproved";
  suggestedRole?: SelfUnderstandingSemanticRole;
};

function resolvedRole(row: Row) {
  return resolveSemanticRole({
    fieldKey: String(row.field_key),
    label: String(row.label ?? row.field_key),
    description: String(row.description ?? ""),
    templateTheme: String(row.template_theme ?? ""),
    storedRole: row.semantic_role,
    storedSource: row.semantic_role_source,
    confirmed: Number(row.semantic_role_confirmed ?? 0) === 1,
    confidence: Number(row.semantic_role_confidence ?? 0),
    sensitivity: String(row.sensitivity_level ?? row.sensitivity ?? "normal") as "normal" | "sensitive" | "highly_sensitive"
  });
}

function scaleFingerprint(row: Row): string {
  let options = "[]";
  try {
    options = JSON.stringify((JSON.parse(String(row.options_json ?? "[]")) as Array<{ key?: string }>).map((item) => String(item.key ?? "")).sort());
  } catch {}
  return [String(row.value_type), row.minimum ?? "", row.maximum ?? "", row.unit ?? "", options].join("|");
}

function parseJsonArray(value: unknown): string[] | undefined {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : undefined;
  } catch {
    return undefined;
  }
}

function entryFingerprint(ids: string[]): string {
  const value = [...new Set(ids)].sort().join("|");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

type ReviewedActivityWatchRow = {
  id: string;
  observed_at: string;
  local_date: string | null;
  duration_seconds: number | null;
  category: string;
  semantic_role: string;
};

export class SqliteSelfUnderstandingRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  history(userId: string): CandidateHistory[] {
    return (
      this.db
        .prepare(
          "SELECT candidate_id,construct_key,condition_role,outcome_role,relation,period_start_at,period_end_at,complete_pair_count,condition_template_id,condition_template_version_id,condition_field_key,condition_scale_fingerprint,outcome_template_id,outcome_template_version_id,outcome_field_key,outcome_scale_fingerprint,source_entry_ids_json,source_entry_fingerprint FROM self_understanding_analysis_history WHERE user_id=? ORDER BY period_start_at"
        )
        .all(userId) as Row[]
    ).flatMap((row) => {
      if (
        !isSelfUnderstandingSemanticRole(row.condition_role) ||
        !isSelfUnderstandingSemanticRole(row.outcome_role)
      ) {
        return [];
      }
      return [
        {
          candidateId: String(row.candidate_id),
          constructKey: String(row.construct_key) as CandidateHistory["constructKey"],
          conditionRole: row.condition_role,
          outcomeRole: row.outcome_role,
          relation: String(row.relation) as CandidateHistory["relation"],
          period: {
            startAt: String(row.period_start_at),
            endAt: String(row.period_end_at)
          },
          completePairCount: Number(row.complete_pair_count),
          conditionTemplateId: String(row.condition_template_id ?? "") || undefined,
          conditionTemplateVersionId: String(row.condition_template_version_id ?? "") || undefined,
          conditionFieldKey: String(row.condition_field_key ?? "") || undefined,
          conditionScaleFingerprint: String(row.condition_scale_fingerprint ?? "") || undefined,
          outcomeTemplateId: String(row.outcome_template_id ?? "") || undefined,
          outcomeTemplateVersionId: String(row.outcome_template_version_id ?? "") || undefined,
          outcomeFieldKey: String(row.outcome_field_key ?? "") || undefined,
          outcomeScaleFingerprint: String(row.outcome_scale_fingerprint ?? "") || undefined,
          sourceEntryIds: parseJsonArray(row.source_entry_ids_json),
          sourceEntryFingerprint: String(row.source_entry_fingerprint ?? "") || undefined
        }
      ];
    });
  }

  analyze(userId: string, input: Record<string, unknown>) {
    const endAt =
      typeof input.endAt === "string" ? input.endAt : new Date().toISOString();
    const startAt =
      typeof input.startAt === "string"
        ? input.startAt
        : new Date(Date.parse(endAt) - 28 * 86400000).toISOString();
    const minimumEntryCount = Math.max(
      8,
      Math.min(100, Number(input.minimumEntryCount ?? 8))
    );
    const includeActivityWatch = input.includeActivityWatch === true;
    const includeBaselineSelfPerception = input.includeBaselineSelfPerception === true;
    const timezoneRow = this.db.prepare("SELECT timezone FROM users WHERE id=?").get(userId) as { timezone?: string } | undefined;
    const timezone = timezoneRow?.timezone || "UTC";
    const templateId =
      typeof input.templateId === "string" && input.templateId
        ? input.templateId
        : undefined;
    const fieldKeys = Array.isArray(input.fieldKeys)
      ? input.fieldKeys
          .filter(
            (item): item is string =>
              typeof item === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(item)
          )
          .slice(0, 30)
      : [];
    const clauses = [
      "e.user_id=?",
      "e.archived_at IS NULL",
      "ev.reviewed_at IS NOT NULL",
      "e.recorded_at>=?",
      "e.recorded_at<=?"
    ];
    const params: string[] = [userId, startAt, endAt];
    if (templateId) {
      clauses.push("e.template_id=?");
      params.push(templateId);
    }
    if (fieldKeys.length) {
      clauses.push(`f.field_key IN (${fieldKeys.map(() => "?").join(",")})`);
      params.push(...fieldKeys);
    }
    const rows = this.db
      .prepare(
        `SELECT e.id,e.recorded_at,e.title,e.template_id,t.theme AS template_theme,
          ev.template_version_id,f.field_key,f.label,f.description,f.value_type,
          f.options_json,f.minimum,f.maximum,f.sensitivity_level,
          f.semantic_role,f.semantic_role_source,f.semantic_role_confidence,
          f.semantic_role_confirmed,f.semantic_merge_allowed,
          ev.is_missing,ev.boolean_value,ev.integer_value,ev.number_value,
          ev.text_value,ev.json_value,ev.date_value,ev.datetime_value,
          ev.duration_seconds
        FROM entries e
        LEFT JOIN entry_templates t ON t.id=e.template_id
        JOIN entry_field_values ev ON ev.entry_id=e.id
        JOIN entry_template_fields f ON f.id=ev.template_field_id
        WHERE ${clauses.join(" AND ")}
        ORDER BY e.recorded_at`
      )
      .all(...params) as Row[];
    const excludedFields: ExcludedAnalysisField[] = [];
    const excludedKeys = new Set<string>();
    const entryCount = new Set(rows.map((row) => String(row.id))).size;
    const externalObservationCount = Number((this.db.prepare("SELECT COUNT(*) AS count FROM external_observations WHERE user_id=? AND source='activitywatch' AND user_confirmed=1 AND review_state='reviewed' AND observed_at>=? AND observed_at<=?").get(userId, startAt, endAt) as { count: number }).count);
    const baselineResponseCount = Number((this.db.prepare("SELECT COUNT(*) AS count FROM baseline_self_perceptions WHERE user_id=? AND deleted_at IS NULL AND user_confirmed=1 AND use_for_self_understanding=1").get(userId) as { count: number }).count);
    const templateVersionIds = [
      ...new Set(
        rows
          .map((row) =>
            typeof row.template_version_id === "string"
              ? row.template_version_id
              : ""
          )
          .filter(Boolean)
      )
    ];
    const filters = {
      templateId: templateId ?? null,
      templateIds: [...new Set(rows.map((row) => String(row.template_id ?? "")).filter(Boolean))],
      templateVersionId:
        templateVersionIds.length === 1 ? templateVersionIds[0] : null,
      templateVersionIds,
      fieldKeys
    };
    if (entryCount < minimumEntryCount) {
      return {
        status: "insufficient",
        statusLabelJa: "データ不足",
        period: { startAt, endAt },
        filters,
        entryCount,
        minimumEntryCount,
        dataShortage: {
          needed: minimumEntryCount - entryCount,
          message:
            "確認済みの構造化記録が不足しています。条件と結果を同じEntryで記録してください。",
          recommendedFields: fieldKeys
        },
        dataQuality: { entryCount, externalObservationCount, baselineResponseCount, confirmedValueCount: rows.length, excludedFieldCount: excludedFields.length, minimumEntryCount },
        sourceSummary: [
          { source: "user_entry", count: entryCount, enabled: true },
          { source: "activitywatch", count: externalObservationCount, enabled: includeActivityWatch && externalObservationCount > 0 },
          { source: "baseline_self_perception", count: baselineResponseCount, enabled: includeBaselineSelfPerception && baselineResponseCount > 0 }
        ],
        excludedFields,
        hypotheses: []
      };
    }
    const definitions = new Map<string, CandidateParameter>();
    const allowedValues: Record<
      string,
      Array<{ valueKey: string; labelJa: string }>
    > = {};
    const records = new Map<string, UnderstandingRecord>();
    const observations: Array<{
      episodeId: string;
      episodeKind?: "entry" | "activity_day" | "daily_join" | "linked_period";
      parameterId: string;
      value: unknown;
      isMissing: boolean;
      observedAt: string;
    }> = [];
    for (const row of rows) {
      const rawValueType = String(row.value_type);
      const valueType = candidateValueType(rawValueType);
      const exclusionKey = `${String(row.template_version_id)}:${String(row.field_key)}`;
      const roleResolution = resolvedRole(row);
      if (!["boolean", "single_choice", "integer", "number"].includes(valueType)) {
        if (!excludedKeys.has(exclusionKey)) {
          excludedKeys.add(exclusionKey);
          excludedFields.push({ templateId: String(row.template_id ?? ""), templateVersionId: String(row.template_version_id ?? ""), fieldKey: String(row.field_key), label: String(row.label ?? row.field_key), reason: "unsupported_value_type" });
        }
        continue;
      }
      if (roleResolution.status !== "confirmed" && roleResolution.status !== "safe_auto_inferred") {
        if (!excludedKeys.has(exclusionKey)) {
          excludedKeys.add(exclusionKey);
          excludedFields.push({ templateId: String(row.template_id ?? ""), templateVersionId: String(row.template_version_id ?? ""), fieldKey: String(row.field_key), label: String(row.label ?? row.field_key), reason: roleResolution.status === "unknown" ? "semantic_role_unknown" : "semantic_role_confirmation_required", suggestedRole: roleResolution.status === "confirmation_required" ? roleResolution.suggestedRole : undefined });
        }
        continue;
      }
      const role = roleResolution.role;
      const fingerprint = scaleFingerprint(row);
      const canMerge = Number(row.semantic_merge_allowed ?? 0) === 1 && roleResolution.status === "confirmed";
      const parameterId = canMerge ? semanticGroupIdFor({ semanticRole: role, valueType, scaleFingerprint: fingerprint, sensitivity: String(row.sensitivity_level ?? "normal") }) : exclusionKey;
      if (!definitions.has(parameterId)) {
        let choices: Array<{ valueKey: string; labelJa: string }> = [];
        try {
          choices = (
            JSON.parse(String(row.options_json ?? "[]")) as Array<{
              key?: string;
              label?: string;
            }>
          )
            .map((choice) => ({
              valueKey: String(choice.key ?? ""),
              labelJa: String(choice.label ?? choice.key ?? "")
            }))
            .filter((choice) => choice.valueKey);
        } catch {
          choices = [];
        }
        allowedValues[parameterId] = choices;
        definitions.set(parameterId, {
          id: parameterId,
          fieldKey: String(row.field_key),
          sourceKind: "entry",
          templateId:
            typeof row.template_id === "string" ? row.template_id : undefined,
          templateVersionId: String(row.template_version_id),
          semanticRole: role,
          sensitivity: String(row.sensitivity_level ?? "normal"),
          semanticMergeAllowed: Number(row.semantic_merge_allowed ?? 0) === 1,
          scaleFingerprint: fingerprint,
          nameJa: String(row.label ?? row.field_key),
          valueType,
          minimumValue:
            typeof row.minimum === "number"
              ? row.minimum
              : valueType === "boolean" || valueType === "single_choice"
                ? undefined
                : 0,
          maximumValue:
            typeof row.maximum === "number"
              ? row.maximum
              : valueType === "boolean" || valueType === "single_choice"
                ? undefined
                : 100,
          positiveValues:
            role === "completion"
              ? ["completed", "started", true]
              : undefined,
          usableAsCondition: true,
          usableAsOutcome: true
        });
      }
      const value = fieldValue(row);
      observations.push({
        episodeId: String(row.id),
        episodeKind: "entry",
        parameterId,
        value,
        isMissing: value === null,
        observedAt: String(row.recorded_at)
      });
      const record = records.get(String(row.id)) ?? {
        id: String(row.id),
        recordedAt: String(row.recorded_at),
        title: String(row.title),
        conditionValues: {},
        outcomeValues: {}
      };
      record.conditionValues[parameterId] = value;
      record.outcomeValues[parameterId] = value;
      records.set(String(row.id), record);
    }

    if (includeActivityWatch) {
      type ActivitySummary = { active: number; coding: number; writing: number; browser: number; communication: number; sessions: number; longest: number; firstMinute: number; firstObservedAt: string; sourceIds: string[] };
      const reviewedActivityRows = this.db.prepare("SELECT id,observed_at,local_date,duration_seconds,category,semantic_role FROM external_observations WHERE user_id=? AND source='activitywatch' AND user_confirmed=1 AND review_state='reviewed' AND observed_at>=? AND observed_at<=? ORDER BY observed_at,id").all(userId, startAt, endAt) as ReviewedActivityWatchRow[];
      const activityByDate = new Map<string, ActivitySummary>();
      for (const row of reviewedActivityRows) {
        const date = row.local_date ?? localDateInTimeZone(row.observed_at, timezone);
        const localTime = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(row.observed_at));
        const firstMinute = Number(localTime.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(localTime.find((part) => part.type === "minute")?.value ?? 0);
        const summary = activityByDate.get(date) ?? { active: 0, coding: 0, writing: 0, browser: 0, communication: 0, sessions: 0, longest: 0, firstMinute, firstObservedAt: row.observed_at, sourceIds: [] };
        const duration = Math.max(0, Number(row.duration_seconds ?? 0));
        summary.active += duration; summary.sessions += 1; summary.longest = Math.max(summary.longest, duration);
        summary.firstMinute = Math.min(summary.firstMinute, firstMinute); summary.sourceIds.push(row.id);
        if (row.category === "coding") summary.coding += duration;
        if (row.category === "writing") summary.writing += duration;
        if (row.category === "browser") summary.browser += duration;
        if (row.category === "communication") summary.communication += duration;
        activityByDate.set(date, summary);
      }
      const activityMetrics: Array<[string, string, "observed_behavior" | "task_continuation" | "time_of_day", string, string, boolean, (summary: ActivitySummary) => number]> = [
        ["activitywatch_active_duration_seconds", "ActivityWatch active duration", "observed_behavior", "seconds", "activitywatch-v2:active_duration_seconds", false, (summary) => summary.active],
        ["activitywatch_coding_duration_seconds", "ActivityWatch coding duration", "observed_behavior", "seconds", "activitywatch-v2:coding_duration_seconds", false, (summary) => summary.coding],
        ["activitywatch_writing_duration_seconds", "ActivityWatch writing duration", "observed_behavior", "seconds", "activitywatch-v2:writing_duration_seconds", false, (summary) => summary.writing],
        ["activitywatch_browser_duration_seconds", "ActivityWatch browser duration", "observed_behavior", "seconds", "activitywatch-v2:browser_duration_seconds", false, (summary) => summary.browser],
        ["activitywatch_communication_duration_seconds", "ActivityWatch communication duration", "observed_behavior", "seconds", "activitywatch-v2:communication_duration_seconds", false, (summary) => summary.communication],
        ["activitywatch_session_count", "ActivityWatch session count", "observed_behavior", "count", "activitywatch-v2:session_count", false, (summary) => summary.sessions],
        ["activitywatch_longest_session_seconds", "ActivityWatch longest session", "task_continuation", "seconds", "activitywatch-v2:longest_session_seconds", false, (summary) => summary.longest],
        ["activitywatch_first_activity_minute", "ActivityWatch first activity time", "time_of_day", "minute_of_day", "activitywatch-v2:first_activity_minute", true, (summary) => summary.firstMinute]
      ];
      const dailyRoles = new Set(["mood", "energy", "fatigue", "self_rating", "task_clarity", "satisfaction", "completion", "start_delay"]);
      const subjectiveByDate = new Map<string, Map<string, { value: unknown; observedAt: string } | null>>();
      for (const record of records.values()) {
        const date = localDateInTimeZone(record.recordedAt, timezone);
        const values = subjectiveByDate.get(date) ?? new Map();
        for (const [parameterId, value] of Object.entries(record.conditionValues)) {
          const definition = definitions.get(parameterId);
          if (!definition?.semanticRole || !dailyRoles.has(definition.semanticRole)) continue;
          values.set(parameterId, values.has(parameterId) ? null : { value, observedAt: record.recordedAt });
        }
        subjectiveByDate.set(date, values);
      }
      for (const [date, summary] of activityByDate) {
        const activityId = `activity_day:${userId}:${date}`;
        const activityRecord: UnderstandingRecord = { id: activityId, recordedAt: summary.firstObservedAt, title: `ActivityWatch ${date}`, conditionValues: {}, outcomeValues: {} };
        const joinId = `daily_join:${userId}:${date}`;
        const joinRecord: UnderstandingRecord = { id: joinId, recordedAt: summary.firstObservedAt, title: `Daily comparison ${date}`, conditionValues: {}, outcomeValues: {} };
        for (const [parameterId, nameJa, semanticRole, unit, fingerprint, usableAsCondition, valueFor] of activityMetrics) {
          if (!definitions.has(parameterId)) definitions.set(parameterId, { id: parameterId, fieldKey: parameterId, semanticRole, sensitivity: "normal", semanticMergeAllowed: false, sourceKind: "activitywatch", unit, scaleFingerprint: fingerprint, nameJa, valueType: "number", minimumValue: 0, usableAsCondition, usableAsOutcome: !usableAsCondition, allowedConditionRoles: ["self_rating", "mood", "energy", "fatigue", "task_clarity", "time_of_day", "day_type"] });
          const value = valueFor(summary);
          activityRecord.conditionValues[parameterId] = value; activityRecord.outcomeValues[parameterId] = value;
          observations.push({ episodeId: activityId, episodeKind: "activity_day", parameterId, value, isMissing: false, observedAt: summary.firstObservedAt });
          joinRecord.conditionValues[parameterId] = value; joinRecord.outcomeValues[parameterId] = value;
          observations.push({ episodeId: joinId, episodeKind: "daily_join", parameterId, value, isMissing: false, observedAt: summary.firstObservedAt });
        }
        records.set(activityId, activityRecord);
        const subjectives = subjectiveByDate.get(date);
        if (!subjectives) continue;
        let joined = false;
        for (const [parameterId, item] of subjectives) {
          if (!item) continue;
          joinRecord.conditionValues[parameterId] = item.value; joinRecord.outcomeValues[parameterId] = item.value;
          observations.push({ episodeId: joinId, episodeKind: "daily_join", parameterId, value: item.value, isMissing: item.value === null, observedAt: item.observedAt });
          joined = true;
        }
        if (joined) records.set(joinId, joinRecord);
      }
    }
    const hypotheses = generateSelfUnderstanding({
      parameters: [...definitions.values()],
      observations,
      records: [...records.values()],
      allowedValues,
      history: this.history(userId),
      now: endAt,
      config: { minimumTotalSamples: minimumEntryCount, maximumCandidates: 5 }
    });
    const baselineRows = includeBaselineSelfPerception
      ? this.db.prepare("SELECT item_key,response,recorded_at FROM baseline_self_perceptions WHERE user_id=? AND deleted_at IS NULL AND user_confirmed=1 AND use_for_self_understanding=1").all(userId) as Array<{ item_key: string; response: number; recorded_at: string }>
      : [];
    const hypothesesWithBaseline = hypotheses.map((hypothesis) => {
      const mapping = BASELINE_ITEM_MAPPINGS.find((item) => item.construct === hypothesis.construct && item.comparisonRoles.includes(hypothesis.interpretationInput.outcome.semanticRole));
      const response = mapping ? baselineRows.find((row) => row.item_key === mapping.itemKey) : undefined;
      const groupA = hypothesis.candidate.cohortA.metricValue;
      const groupB = hypothesis.candidate.cohortB.metricValue;
      const maximum = Math.max(groupA, groupB, 1);
      const chart = buildFixedChartModel({
        kind: "condition_comparison",
        title: `${hypothesis.interpretationInput.condition.label} and ${hypothesis.interpretationInput.outcome.label}`,
        sampleCount: hypothesis.candidate.completePairCount,
        yAxis: { min: Math.min(0, groupA, groupB), max: maximum, label: hypothesis.interpretationInput.outcome.label },
        series: [{ key: "cohorts", label: hypothesis.interpretationInput.outcome.label, points: [{ recordedAt: hypothesis.interpretationInput.condition.groupA, value: groupA }, { recordedAt: hypothesis.interpretationInput.condition.groupB, value: groupB }] }],
        notes: ["This chart is descriptive and does not show causation."]
      });
      if (!mapping || !response) return { ...hypothesis, charts: [chart] };
      return { ...hypothesis, charts: [chart], baselineComparison: { source: "baseline_self_perception", itemKey: mapping.itemKey, response: response.response, recordedAt: response.recorded_at, direction: mapping.direction, message: "This is a general self-perception and is shown alongside, not averaged with, daily observations." } };
    });
    const createdAt = new Date().toISOString();
    const save = this.db.prepare(
      `INSERT INTO self_understanding_analysis_history(
        id,user_id,candidate_id,construct_key,condition_role,outcome_role,
        relation,period_start_at,period_end_at,complete_pair_count,
        condition_template_id,condition_template_version_id,condition_field_key,condition_scale_fingerprint,
        outcome_template_id,outcome_template_version_id,outcome_field_key,outcome_scale_fingerprint,
        source_entry_ids_json,source_entry_fingerprint,candidate_snapshot_json,created_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id,candidate_id,period_start_at,period_end_at)
      DO UPDATE SET
        construct_key=excluded.construct_key,
        condition_role=excluded.condition_role,
        outcome_role=excluded.outcome_role,
        relation=excluded.relation,
        complete_pair_count=excluded.complete_pair_count,
        condition_template_id=excluded.condition_template_id,
        condition_template_version_id=excluded.condition_template_version_id,
        condition_field_key=excluded.condition_field_key,
        condition_scale_fingerprint=excluded.condition_scale_fingerprint,
        outcome_template_id=excluded.outcome_template_id,
        outcome_template_version_id=excluded.outcome_template_version_id,
        outcome_field_key=excluded.outcome_field_key,
        outcome_scale_fingerprint=excluded.outcome_scale_fingerprint,
        source_entry_ids_json=excluded.source_entry_ids_json,
        source_entry_fingerprint=excluded.source_entry_fingerprint,
        candidate_snapshot_json=excluded.candidate_snapshot_json`
    );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const hypothesis of hypothesesWithBaseline) {
        const conditionParameter = definitions.get(hypothesis.candidate.conditionParameterId);
        const outcomeParameter = definitions.get(hypothesis.candidate.outcomeParameterId);
        const sourceEntryIds = [...new Set([...hypothesis.supportingEntryIds, ...hypothesis.contradictingEntryIds])].sort();
        save.run(
          `analysis_${userId}_${hypothesis.id}_${startAt}_${endAt}`,
          userId,
          hypothesis.id,
          hypothesis.construct,
          hypothesis.interpretationInput.condition.semanticRole,
          hypothesis.interpretationInput.outcome.semanticRole,
          hypothesis.candidate.relation,
          startAt,
          endAt,
          hypothesis.candidate.completePairCount,
          conditionParameter?.templateId ?? null,
          conditionParameter?.templateVersionId ?? null,
          conditionParameter?.fieldKey ?? hypothesis.interpretationInput.condition.fieldKey,
          conditionParameter?.scaleFingerprint ?? null,
          outcomeParameter?.templateId ?? null,
          outcomeParameter?.templateVersionId ?? null,
          outcomeParameter?.fieldKey ?? hypothesis.interpretationInput.outcome.fieldKey,
          outcomeParameter?.scaleFingerprint ?? null,
          JSON.stringify(sourceEntryIds),
          entryFingerprint(sourceEntryIds),
          JSON.stringify(hypothesis),
          createdAt
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return {
      version: 2,
      status: hypothesesWithBaseline.length ? "ready" : "insufficient",
      statusLabelJa: hypothesesWithBaseline.length
        ? "分析候補あり"
        : "比較可能な差が不足",
      period: { startAt, endAt },
      filters,
      entryCount,
      minimumEntryCount,
      hypotheses: hypothesesWithBaseline,
      dataQuality: { entryCount, activityWatchObservationCount: externalObservationCount, activityWatchDailyCount: includeActivityWatch ? Number((this.db.prepare("SELECT COUNT(DISTINCT local_date) AS count FROM external_observations WHERE user_id=? AND source='activitywatch' AND user_confirmed=1 AND review_state='reviewed' AND observed_at>=? AND observed_at<=?").get(userId, startAt, endAt) as { count: number }).count) : 0, baselineResponseCount, confirmedValueCount: rows.length, excludedFieldCount: excludedFields.length, minimumEntryCount },
      sourceSummary: [
        { source: "user_entry", count: entryCount, enabled: true },
        { source: "activitywatch", count: externalObservationCount, enabled: includeActivityWatch && externalObservationCount > 0 },
        { source: "baseline_self_perception", count: baselineResponseCount, enabled: includeBaselineSelfPerception && baselineResponseCount > 0 }
      ],
      excludedFields,
      explanationMode: "deterministic_fallback"
    };
  }

  latestSnapshot(userId: string, candidateId: string) {
    const row = this.db
      .prepare(
        "SELECT candidate_snapshot_json FROM self_understanding_analysis_history WHERE user_id=? AND candidate_id=? ORDER BY created_at DESC LIMIT 1"
      )
      .get(userId, candidateId) as { candidate_snapshot_json: string } | undefined;
    if (!row) return undefined;
    try {
      return JSON.parse(row.candidate_snapshot_json) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }

  relatedSelfModelItems(userId: string, constructKey: string) {
    return this.db
      .prepare(
        "SELECT id,statement,status,construct_key,tendency_scope,last_reviewed_at FROM self_beliefs WHERE user_id=? AND construct_key=? AND status!='archived' ORDER BY last_reviewed_at DESC,created_at DESC"
      )
      .all(userId, constructKey);
  }
}
