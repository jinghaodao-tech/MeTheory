import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqlitePrivacyRepository } from "../apps/api/src/privacyRepository.ts";
import { SqliteTemplateRepository } from "../apps/api/src/templateRepository.ts";
import { SqliteEntryRepository } from "../apps/api/src/entryRepository.ts";

test("sensitive values require field consent and safe delete is transactional", () => {
  const directory = mkdtempSync(join(tmpdir(), "metheory-privacy-"));
  const db = new DatabaseSync(join(directory, "privacy.sqlite3"));
  try {
    db.exec(readFileSync(join(process.cwd(), "db", "ts_mvp_schema.sql"), "utf8"));
    db.prepare("INSERT INTO users(id,auth_subject,locale,timezone,created_at) VALUES(?,?,?,?,?)").run("privacy-user", "privacy-auth", "ja-JP", "Asia/Tokyo", new Date().toISOString());
    const templates = new SqliteTemplateRepository(db);
    const privacy = new SqlitePrivacyRepository(db);
    const template = templates.save("privacy-user", { approved: true, theme: "private", name: "Private", description: "", fields: [{ fieldKey: "health_note", label: "Health note", inputType: "text", valueType: "text", required: false, displayOrder: 1, sensitivity: "sensitive", sensitivityLevel: "sensitive", classificationSource: "user_selected", reason: "explicit" }] }) as any;
    assert.throws(() => templates.createEntry("privacy-user", template.id, { values: { health_note: "private value" } }), /privacy_consent_required/);
    const consent = privacy.grantConsent({ userId: "privacy-user", templateId: template.id, templateVersionId: template.currentVersion.id, fieldKey: "health_note", consentType: "sensitive_field_processing", scope: "field", grantedAt: new Date().toISOString() });
    const entry = templates.createEntry("privacy-user", template.id, { values: { health_note: "private value" } });
    db.prepare("INSERT INTO users(id,auth_subject,locale,timezone,created_at) VALUES(?,?,?,?,?)").run("privacy-other", "privacy-other-auth", "ja-JP", "Asia/Tokyo", new Date().toISOString());
    const searchDocument = (id: string, user: string, kind: string, source: string) => db.prepare("INSERT INTO search_documents(id,user_id,source_kind,source_id,title,search_text,tags_json,tokens_json,doc_length,recorded_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(id, user, kind, source, "title", "private", "[]", "[]", 1, new Date().toISOString(), new Date().toISOString());
    searchDocument("entry-doc", "privacy-user", "entry", entry.id); searchDocument("hypothesis-doc", "privacy-user", "hypothesis", "hypothesis-1"); searchDocument("other-entry-doc", "privacy-other", "entry", "other-entry");
    db.prepare("INSERT INTO privacy_extraction_corrections(id,user_id,template_id,template_version_id,field_key,source_pattern,original_value_json,corrected_value_json,sensitivity_level,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run("correction-1", "privacy-user", template.id, template.currentVersion.id, "health_note", "manual", "{\"redacted\":true}", "{\"redacted\":true}", "sensitive", new Date().toISOString());
    const plan = privacy.createSafeDeletePlan({ userId: "privacy-user", consentId: consent.id }, [{ path: "notes/private.md", matches: 1 }], 2);
    assert.equal(plan.affectedCurrentValues, 1);
    assert.equal(plan.affectedCorrections, 1);
    assert.throws(() => privacy.executeSafeDelete("privacy-user", plan.id, "DELETE 0 ITEMS"), /safe_delete_confirmation_mismatch/);
    const result = privacy.executeSafeDelete("privacy-user", plan.id, plan.requiredConfirmationText);
    assert.equal(result.deletedValues, 1);
    assert.equal(Number((db.prepare("SELECT COUNT(*) AS count FROM entry_field_values WHERE entry_id=?").get(entry.id) as { count: number }).count), 0);
    assert.equal(Number((db.prepare("SELECT COUNT(*) AS count FROM privacy_extraction_corrections WHERE id=?").get("correction-1") as { count: number }).count), 0);
    assert.equal(Number((db.prepare("SELECT COUNT(*) AS count FROM search_documents WHERE id=?").get("entry-doc") as { count: number }).count), 0);
    assert.equal(Number((db.prepare("SELECT COUNT(*) AS count FROM search_documents WHERE id=?").get("hypothesis-doc") as { count: number }).count), 1);
    assert.equal(Number((db.prepare("SELECT COUNT(*) AS count FROM search_documents WHERE id=?").get("other-entry-doc") as { count: number }).count), 1);
    assert.equal(Number((db.prepare("SELECT COUNT(*) AS count FROM privacy_audit_events WHERE user_id=?").get("privacy-user") as { count: number }).count) > 0, true);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("external AI consent requires a destination fingerprint", () => {
  const directory = mkdtempSync(join(tmpdir(), "metheory-consent-"));
  const db = new DatabaseSync(join(directory, "privacy.sqlite3"));
  try {
    db.exec(readFileSync(join(process.cwd(), "db", "ts_mvp_schema.sql"), "utf8"));
    db.prepare("INSERT INTO users(id,auth_subject,locale,timezone,created_at) VALUES(?,?,?,?,?)").run("consent-user", "consent-auth", "ja-JP", "Asia/Tokyo", new Date().toISOString());
    const privacy = new SqlitePrivacyRepository(db);
    assert.throws(() => privacy.grantConsent({ userId: "consent-user", fieldKey: "note", consentType: "external_ai_transfer", scope: "single_value", grantedAt: new Date().toISOString(), providerId: "openai", destinationFingerprint: null }), /external_ai_destination_required/);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("highly sensitive downgrade creates a new template version", () => {
  const directory = mkdtempSync(join(tmpdir(), "metheory-downgrade-"));
  const db = new DatabaseSync(join(directory, "privacy.sqlite3"));
  try {
    db.exec(readFileSync(join(process.cwd(), "db", "ts_mvp_schema.sql"), "utf8"));
    db.prepare("INSERT INTO users(id,auth_subject,locale,timezone,created_at) VALUES(?,?,?,?,?)").run("downgrade-user", "downgrade-auth", "ja-JP", "Asia/Tokyo", new Date().toISOString());
    const templates = new SqliteTemplateRepository(db);
    const privacy = new SqlitePrivacyRepository(db);
    const template = templates.save("downgrade-user", { approved: true, theme: "identity", name: "Identity", description: "", fields: [{ fieldKey: "precise_location", label: "Precise location", inputType: "text", valueType: "text", required: false, displayOrder: 1, sensitivity: "sensitive", sensitivityLevel: "highly_sensitive", classificationSource: "user_selected", reason: "explicit" }] }) as any;
    const consent = privacy.grantConsent({ userId: "downgrade-user", templateId: template.id, templateVersionId: template.currentVersion.id, fieldKey: "precise_location", consentType: "highly_sensitive_downgrade", scope: "field", grantedAt: new Date().toISOString() });
    const downgraded = templates.downgradeHighlySensitiveField("downgrade-user", template.id, "precise_location", consent.id) as any;
    assert.notEqual(downgraded.currentVersion.id, template.currentVersion.id);
    assert.equal(downgraded.currentVersion.fields[0].sensitivity_level, "sensitive");
    assert.equal((db.prepare("SELECT sensitivity_level FROM entry_template_fields WHERE template_version_id=?").get(template.currentVersion.id) as { sensitivity_level: string }).sensitivity_level, "highly_sensitive");
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("secret fields and unconfirmed AI classifications cannot be persisted", () => {
  const directory = mkdtempSync(join(tmpdir(), "metheory-privacy-policy-"));
  const db = new DatabaseSync(join(directory, "privacy.sqlite3"));
  try {
    db.exec(readFileSync(join(process.cwd(), "db", "ts_mvp_schema.sql"), "utf8"));
    db.prepare("INSERT INTO users(id,auth_subject,locale,timezone,created_at) VALUES(?,?,?,?,?)").run("policy-user", "policy-auth", "ja-JP", "Asia/Tokyo", new Date().toISOString());
    const templates = new SqliteTemplateRepository(db);
    const field = (fieldKey: string, extra: Record<string, unknown> = {}) => ({ fieldKey, label: fieldKey, inputType: "text", valueType: "text", required: false, displayOrder: 1, sensitivity: "normal", reason: "explicit", ...extra });
    assert.throws(() => templates.save("policy-user", { approved: true, theme: "secret", name: "Secret", description: "", fields: [field("api_key")] }), /prohibited_secret_field_definition/);
    assert.throws(() => templates.save("policy-user", { approved: true, theme: "ai", name: "AI", description: "", fields: [field("private_note", { classificationSource: "ai_suggested", sensitivityLevel: "sensitive" })] }), /privacy_classification_confirmation_required/);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("highly sensitive values require a value override and revocation blocks future writes", () => {
  const directory = mkdtempSync(join(tmpdir(), "metheory-privacy-high-"));
  const db = new DatabaseSync(join(directory, "privacy.sqlite3"));
  try {
    db.exec(readFileSync(join(process.cwd(), "db", "ts_mvp_schema.sql"), "utf8"));
    db.prepare("INSERT INTO users(id,auth_subject,locale,timezone,created_at) VALUES(?,?,?,?,?)").run("high-user", "high-auth", "ja-JP", "Asia/Tokyo", new Date().toISOString());
    const templates = new SqliteTemplateRepository(db); const privacy = new SqlitePrivacyRepository(db);
    const template = templates.save("high-user", { approved: true, theme: "high", name: "High", description: "", fields: [{ fieldKey: "precise_location", label: "Precise location", inputType: "text", valueType: "text", required: false, displayOrder: 1, sensitivity: "sensitive", sensitivityLevel: "highly_sensitive", classificationSource: "user_selected", reason: "explicit" }] }) as any;
    assert.throws(() => templates.createEntry("high-user", template.id, { values: { precise_location: "somewhere" } }), /highly_sensitive_value_override_required/);
    const consent = privacy.grantConsent({ userId: "high-user", templateId: template.id, templateVersionId: template.currentVersion.id, fieldKey: "precise_location", consentType: "highly_sensitive_downgrade", scope: "single_value", grantedAt: new Date().toISOString() });
    const entry = templates.createEntry("high-user", template.id, { values: { precise_location: "somewhere" }, privacyOverrides: { precise_location: consent.id } });
    assert.equal(Number((db.prepare("SELECT COUNT(*) AS count FROM privacy_value_overrides WHERE entry_id=?").get(entry.id) as { count: number }).count), 1);
    privacy.revokeConsent("high-user", consent.id);
    assert.throws(() => templates.createEntry("high-user", template.id, { values: { precise_location: "again" }, privacyOverrides: { precise_location: consent.id } }), /highly_sensitive_value_override_required/);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("extraction application enforces privacy and records a value override", () => {
  const directory = mkdtempSync(join(tmpdir(), "metheory-privacy-extraction-"));
  const db = new DatabaseSync(join(directory, "privacy.sqlite3"));
  try {
    db.exec(readFileSync(join(process.cwd(), "db", "ts_mvp_schema.sql"), "utf8"));
    db.prepare("INSERT INTO users(id,auth_subject,locale,timezone,created_at) VALUES(?,?,?,?,?)").run("extract-user", "extract-auth", "ja-JP", "Asia/Tokyo", new Date().toISOString());
    const templates = new SqliteTemplateRepository(db); const privacy = new SqlitePrivacyRepository(db); const entries = new SqliteEntryRepository(db);
    const template = templates.save("extract-user", { approved: true, theme: "health", name: "Health", description: "", fields: [{ fieldKey: "health_context", label: "Health context", inputType: "text", valueType: "text", required: false, displayOrder: 1, sensitivity: "sensitive", sensitivityLevel: "sensitive", classificationSource: "user_selected", reason: "explicit" }] }) as any;
    const entry = templates.createEntry("extract-user", template.id, { values: {} });
    assert.throws(() => entries.applyExtraction("extract-user", entry.id, { templateVersionId: template.currentVersion.id, values: { health_context: "value" }, sourceContentHash: "hash" }), /privacy_consent_required/);
    privacy.grantConsent({ userId: "extract-user", templateId: template.id, templateVersionId: template.currentVersion.id, fieldKey: "health_context", consentType: "sensitive_field_processing", scope: "field", grantedAt: new Date().toISOString() });
    assert.equal(entries.applyExtraction("extract-user", entry.id, { templateVersionId: template.currentVersion.id, values: { health_context: "value" }, sourceContentHash: "hash" }).applied, 1);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});
