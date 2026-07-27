export type SyncStatus = "created" | "updated" | "moved" | "unchanged" | "skipped" | "conflict" | "failed";
export type SyncResult = { status: SyncStatus; path: string; entryId?: string; reason: string; errorCode?: string };
