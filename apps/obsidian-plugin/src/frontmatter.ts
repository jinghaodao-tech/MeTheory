const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function entryIdFromFrontmatter(note: string): string | null {
  const match = note.match(FRONTMATTER);
  if (!match) return null;
  const line = match[1].split(/\r?\n/).find((value) => /^metheory_entry_id\s*:/.test(value));
  if (!line) return null;
  const id = line.replace(/^metheory_entry_id\s*:\s*/, "").trim().replace(/^['"]|['"]$/g, "");
  return id || null;
}

export function entryBodyFromNote(note: string): string {
  return note.replace(FRONTMATTER, "");
}

export function entryTitleFromPath(path: string): string {
  const filename = path.split(/[\\/]/).at(-1) ?? "Untitled";
  return filename.replace(/\.md$/i, "") || "Untitled";
}
