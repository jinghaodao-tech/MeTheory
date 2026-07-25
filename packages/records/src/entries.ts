export const ENTRY_EXPORT_FORMAT_VERSION = "1";

export type Entry = {
  id: string;
  userId: string;
  templateId: string | null;
  episodeId: string | null;
  externalSource: string | null;
  externalSourceId: string | null;
  title: string;
  body: string;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type EntryWriteInput = {
  id?: string;
  userId: string;
  templateId?: string | null;
  episodeId?: string | null;
  externalSource?: string | null;
  externalSourceId?: string | null;
  title: string;
  body: string;
  recordedAt?: string;
};

export type ValidatedEntryWriteInput = Omit<EntryWriteInput, "id" | "recordedAt"> & {
  id?: string;
  templateId: string | null;
  episodeId: string | null;
  externalSource: string | null;
  externalSourceId: string | null;
  recordedAt: string;
};

const MAX_TITLE_LENGTH = 500;
const MAX_BODY_LENGTH = 250_000;
const MAX_EXTERNAL_ID_LENGTH = 1_000;

function requiredText(value: unknown, field: string, maximumLength: number): string {
  if (typeof value !== "string") throw new Error(`invalid_${field}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength) throw new Error(`invalid_${field}`);
  return normalized;
}

function optionalText(value: unknown, field: string, maximumLength: number): string | null {
  if (value === undefined || value === null) return null;
  return requiredText(value, field, maximumLength);
}

function optionalIdentifier(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requiredText(value, field, 128);
}

function validIsoDate(value: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error("invalid_recorded_at");
  return value;
}

export function validateEntryWriteInput(input: EntryWriteInput, defaultRecordedAt = new Date().toISOString()): ValidatedEntryWriteInput {
  const userId = requiredText(input.userId, "user_id", 128);
  const title = requiredText(input.title, "title", MAX_TITLE_LENGTH);
  if (typeof input.body !== "string" || input.body.length > MAX_BODY_LENGTH) throw new Error("invalid_body");
  const externalSource = optionalText(input.externalSource, "external_source", 64);
  const externalSourceId = optionalText(input.externalSourceId, "external_source_id", MAX_EXTERNAL_ID_LENGTH);
  if (Boolean(externalSource) !== Boolean(externalSourceId)) throw new Error("external_source_identity_required");

  return {
    id: optionalIdentifier(input.id, "entry_id"),
    userId,
    templateId: optionalIdentifier(input.templateId, "template_id") ?? null,
    episodeId: optionalIdentifier(input.episodeId, "episode_id") ?? null,
    externalSource,
    externalSourceId,
    title,
    body: input.body,
    recordedAt: validIsoDate(input.recordedAt ?? defaultRecordedAt),
  };
}
