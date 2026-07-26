import { entryBodyFromNote, entryIdFromFrontmatter, entryRecordedAtFromFrontmatter, entryRecordedAtFromPath, entryTitleFromPath } from "./frontmatter.ts";

export type EntryRegistrationInput = {
  userId: string;
  note: string;
  path: string;
  sourceUpdatedAt: string;
  creationTimestamp: string;
  entryId?: string | null;
};

export function entryRegistrationPayload(input: EntryRegistrationInput): Record<string, string | undefined> {
  const entryId = input.entryId === undefined ? entryIdFromFrontmatter(input.note) : input.entryId;
  return {
    id: entryId ?? undefined,
    userId: input.userId,
    externalSource: "obsidian",
    externalSourceId: input.path,
    title: entryTitleFromPath(input.path),
    body: entryBodyFromNote(input.note),
    recordedAt: entryId ? undefined : entryRecordedAtFromFrontmatter(input.note) ?? entryRecordedAtFromPath(input.path) ?? input.creationTimestamp,
    sourceUpdatedAt: input.sourceUpdatedAt,
  };
}
