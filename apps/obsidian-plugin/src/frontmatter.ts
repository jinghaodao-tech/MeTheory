const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function frontmatterValue(note: string, key: string): string | null {
  const match = note.match(FRONTMATTER);
  if (!match) return null;
  const line = match[1].split(/\r?\n/).find((value) => new RegExp(`^${key}\\s*:`).test(value));
  if (!line) return null;
  return line.replace(new RegExp(`^${key}\\s*:\\s*`), "").trim().replace(/^['"]|['"]$/g, "");
}

function normalizedDate(value: string, errorCode: string): string {
  const calendar = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const dateOnly = /^(\d{4}-\d{2}-\d{2})$/.test(value);
  const parsed = new Date(dateOnly ? `${value}T00:00:00.000Z` : value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(errorCode);
  if (calendar) {
    const year = Number(calendar[1]);
    const month = Number(calendar[2]);
    const day = Number(calendar[3]);
    const calendarDate = new Date(Date.UTC(year, month - 1, day));
    if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) throw new Error(errorCode);
  }
  return parsed.toISOString();
}

export function entryIdFromFrontmatter(note: string): string | null {
  const id = frontmatterValue(note, "metheory_entry_id");
  return id || null;
}

export function entryRecordedAtFromFrontmatter(note: string): string | null {
  const explicitValue = frontmatterValue(note, "recorded_at") ?? frontmatterValue(note, "date") ?? frontmatterValue(note, "metheory_recorded_at");
  return explicitValue === null ? null : normalizedDate(explicitValue, "invalid_frontmatter_recorded_at");
}

export function entryRecordedAtFromPath(path: string): string | null {
  const filename = path.split(/[\\/]/).at(-1) ?? "";
  const date = /^(\d{4}-\d{2}-\d{2})(?:\.md)?$/i.exec(filename)?.[1];
  return date ? normalizedDate(date, "invalid_filename_recorded_at") : null;
}

export function entryBodyFromNote(note: string): string {
  return note.replace(FRONTMATTER, "");
}

export function entryTitleFromPath(path: string): string {
  const filename = path.split(/[\\/]/).at(-1) ?? "Untitled";
  return filename.replace(/\.md$/i, "") || "Untitled";
}
