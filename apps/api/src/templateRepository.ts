import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { newTemplateId, validateTemplateDraft, valueForField, type TemplateDraft } from "../../../packages/templates/src/index.ts";
import { containsProhibitedSecretValue, validatePersistablePrivacyPolicy } from "../../../packages/privacy/src/index.ts";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;

export class SqliteTemplateRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) { this.db = db; }

  list(userId: string) { return this.db.prepare("SELECT t.*, v.id AS version_id, v.version_number, (SELECT COUNT(*) FROM entry_template_fields f WHERE f.template_version_id=v.id) AS field_count FROM entry_templates t JOIN entry_template_versions v ON v.id=t.current_version_id WHERE t.user_id=? AND t.archived_at IS NULL ORDER BY t.updated_at DESC").all(userId); }

  detail(userId: string, templateId: string) {
    const template = this.db.prepare("SELECT * FROM entry_templates WHERE user_id=? AND id=?").get(userId, templateId) as Record<string, unknown> | undefined;
    if (!template) throw new Error("template_not_found");
    const version = this.db.prepare("SELECT * FROM entry_template_versions WHERE id=?").get(String(template.current_version_id)) as Record<string, unknown>;
    const fields = this.db.prepare("SELECT * FROM entry_template_fields WHERE template_version_id=? ORDER BY display_order").all(String(version.id)).map((row: any) => ({ ...row, options: JSON.parse(row.options_json) }));
    return { ...template, currentVersion: { ...version, fields } };
  }

  save(userId: string, input: any) {
    if (input.approved !== true) throw new Error("template_approval_required");
    const draft = validateTemplateDraft({ theme: input.theme, name: input.name, description: input.description, fields: input.fields });
    const timestamp = now(); const templateId = newTemplateId(); const versionId = id("template_version");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("INSERT INTO entry_templates(id,user_id,name,theme,description,current_version_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(templateId, userId, draft.name, draft.theme, draft.description, versionId, timestamp, timestamp);
      this.insertVersion(templateId, versionId, draft, input, 1, timestamp);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return this.detail(userId, templateId);
  }

  private insertVersion(templateId: string, versionId: string, draft: TemplateDraft, input: any, version: number, timestamp: string) {
    this.db.prepare("INSERT INTO entry_template_versions(id,template_id,version_number,generation_source,ai_provider,ai_model,prompt_version,created_at) VALUES(?,?,?,?,?,?,?,?)").run(versionId, templateId, version, input.generationSource ?? "user", input.aiProvider ?? null, input.aiModel ?? null, input.promptVersion ?? "template-v1", timestamp);
    for (const field of draft.fields) {
      const policy = validatePersistablePrivacyPolicy(field);
      this.db.prepare("INSERT INTO entry_template_fields(id,template_version_id,field_key,label,description,input_type,value_type,required,display_order,options_json,minimum,maximum,unit,sensitivity,reason,sensitivity_level,classification_source,prohibited_secret_risk) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id("template_field"), versionId, field.fieldKey, field.label, field.description ?? "", field.inputType, field.valueType, field.required ? 1 : 0, field.displayOrder, JSON.stringify(field.options ?? []), field.minimum ?? null, field.maximum ?? null, field.unit ?? null, field.sensitivity, field.reason, policy.sensitivityLevel, policy.classificationSource, policy.prohibitedSecretRisk ? 1 : 0);
    }
  }

  private activeConsent(userId: string, templateId: string, versionId: string, fieldKey: string, consentType: string, consentId?: string) {
    const query = consentId
      ? "SELECT id FROM privacy_consents WHERE id=? AND user_id=? AND template_id=? AND template_version_id=? AND field_key=? AND consent_type=? AND revoked_at IS NULL"
      : "SELECT id FROM privacy_consents WHERE user_id=? AND template_id=? AND template_version_id=? AND field_key=? AND consent_type=? AND revoked_at IS NULL LIMIT 1";
    const args = consentId ? [consentId, userId, templateId, versionId, fieldKey, consentType] : [userId, templateId, versionId, fieldKey, consentType];
    return this.db.prepare(query).get(...args) as { id: string } | undefined;
  }

  private insertEntryValue(entryId: string, versionId: string, field: any, value: unknown, timestamp: string) {
    this.db.prepare("INSERT INTO entry_field_values(id,entry_id,template_version_id,template_field_id,text_value,integer_value,number_value,boolean_value,json_value,date_value,datetime_value,duration_seconds,is_missing,source,reviewed_at,updated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(...([id("entry_value"), entryId, versionId, field.id, typeof value === "string" ? value : null, typeof value === "number" && Number.isInteger(value) ? value : null, typeof value === "number" && !Number.isInteger(value) ? value : null, typeof value === "boolean" ? (value ? 1 : 0) : null, Array.isArray(value) ? JSON.stringify(value) : null, field.value_type === "date" ? value : null, field.value_type === "datetime" ? value : null, field.value_type === "duration_seconds" ? value : null, value === null ? 1 : 0, "user_confirmed", timestamp, timestamp, timestamp] as any[]));
  }

  createEntry(userId: string, templateId: string, input: any) {
    const detail = this.detail(userId, templateId) as any;
    if (detail.archived_at) throw new Error("template_archived");
    const versionId = String(detail.currentVersion.id); const entryId = id("entry"); const timestamp = now();
    const overrides = (input.privacyOverrides ?? {}) as Record<string, string>;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("INSERT INTO entries(id,user_id,template_id,template_version_id,title,body,recorded_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(entryId, userId, templateId, versionId, input.title ?? detail.name, input.body ?? "", input.recordedAt ?? timestamp, timestamp, timestamp);
      for (const field of detail.currentVersion.fields) {
        const value = valueForField(field, input.values?.[field.field_key]);
        if (value !== null && (field.prohibited_secret_risk || containsProhibitedSecretValue(value))) throw new Error("prohibited_secret_value");
        if (value === null) { this.insertEntryValue(entryId, versionId, field, value, timestamp); continue; }
        let overrideConsentId: string | undefined;
        if (field.sensitivity_level === "highly_sensitive") {
          overrideConsentId = overrides[field.field_key];
          if (!this.activeConsent(userId, templateId, versionId, field.field_key, "highly_sensitive_downgrade", overrideConsentId)) throw new Error("highly_sensitive_value_override_required");
        } else if (field.sensitivity_level === "sensitive" && !this.activeConsent(userId, templateId, versionId, field.field_key, "sensitive_field_processing")) {
          throw new Error("privacy_consent_required");
        }
        this.insertEntryValue(entryId, versionId, field, value, timestamp);
        if (overrideConsentId) this.db.prepare("INSERT INTO privacy_value_overrides(entry_id,template_version_id,field_key,original_level,effective_level,consent_id,created_at) VALUES(?,?,?,?,?,?,?)").run(entryId, versionId, field.field_key, "highly_sensitive", "sensitive", overrideConsentId, timestamp);
      }
      this.db.exec("COMMIT");
      return { id: entryId, templateId, templateVersionId: versionId };
    } catch (error) { this.db.exec("ROLLBACK"); throw new Error(error instanceof Error ? error.message : "entry_creation_failed"); }
  }

  archive(userId: string, templateId: string) { if (!this.db.prepare("UPDATE entry_templates SET archived_at=?,updated_at=? WHERE user_id=? AND id=? AND archived_at IS NULL").run(now(), now(), userId, templateId).changes) throw new Error("template_not_found"); }

  downgradeHighlySensitiveField(userId: string, templateId: string, fieldKey: string, consentId: string) {
    const detail = this.detail(userId, templateId) as any; const oldVersionId = String(detail.currentVersion.id);
    if (!this.activeConsent(userId, templateId, oldVersionId, fieldKey, "highly_sensitive_downgrade", consentId)) throw new Error("downgrade_consent_required");
    const target = detail.currentVersion.fields.find((field: any) => field.field_key === fieldKey);
    if (!target || target.sensitivity_level !== "highly_sensitive") throw new Error("highly_sensitive_field_not_found");
    if (target.prohibited_secret_risk) throw new Error("prohibited_secret_cannot_be_downgraded");
    const nextVersion = Number(detail.currentVersion.version_number) + 1; const versionId = id("template_version");
    const draft = { theme: detail.theme, name: detail.name, description: detail.description, fields: detail.currentVersion.fields.map((field: any) => ({ fieldKey: field.field_key, label: field.label, description: field.description, inputType: field.input_type, valueType: field.value_type, required: Boolean(field.required), displayOrder: field.display_order, options: JSON.parse(field.options_json ?? "[]"), minimum: field.minimum ?? undefined, maximum: field.maximum ?? undefined, unit: field.unit ?? undefined, sensitivity: field.field_key === fieldKey ? "sensitive" : field.sensitivity, sensitivityLevel: field.field_key === fieldKey ? "sensitive" : field.sensitivity_level, classificationSource: field.field_key === fieldKey ? "user_selected" : field.classification_source, prohibitedSecretRisk: Boolean(field.prohibited_secret_risk), reason: field.reason })) } as TemplateDraft;
    const timestamp = now(); this.db.exec("BEGIN IMMEDIATE");
    try {
      this.insertVersion(templateId, versionId, draft, { generationSource: "user", promptVersion: "privacy-downgrade-v1" }, nextVersion, timestamp);
      this.db.prepare("INSERT OR IGNORE INTO privacy_value_overrides(entry_id,template_version_id,field_key,original_level,effective_level,consent_id,created_at) SELECT ev.entry_id,ev.template_version_id,?, 'highly_sensitive','sensitive',?,? FROM entry_field_values ev WHERE ev.template_version_id=? AND ev.template_field_id=? AND ev.is_missing=0").run(fieldKey, consentId, timestamp, oldVersionId, target.id);
      this.db.prepare("UPDATE entry_templates SET current_version_id=?,updated_at=? WHERE id=? AND user_id=?").run(versionId, timestamp, templateId, userId);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return this.detail(userId, templateId);
  }
}
