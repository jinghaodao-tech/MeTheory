export type DatabaseMode = "workspace" | "appData";
export type WorkspaceAiConfig = {
  provider?: string;
  baseUrl?: string;
  templateGenerationModel?: string;
  extractionModel?: string;
  autoStart?: boolean;
  startupRetryCount?: number;
  startupTimeoutSeconds?: number;
  idleTimeoutMinutes?: number;
  customRuntime?: { executablePath?: string; arguments?: string[]; workingDirectory?: string; environment?: Record<string, string>; idleTimeoutMinutes?: number } | null;
  [key: string]: unknown;
};
export type WorkspaceConfig = {
  schemaVersion: number;
  workspaceId: string;
  name: string;
  database: { mode: DatabaseMode; path: string };
  service: { startupMode: "onWorkspaceOpen" | "onDemand" | "manual"; shutdownMode: "onEditorClose" | "idle" | "keepRunning"; idleTimeoutMinutes: number; apiUrl?: string };
  backup: { enabled: boolean; beforeMigration: boolean; beforeBulkChange: boolean; periodic: boolean; retentionCount: number };
  notes: { rootDirectory: string; maximumCategoryDepth: number; defaultDirectory: string };
  ai?: WorkspaceAiConfig;
};

export function validateWorkspaceConfig(input: unknown): WorkspaceConfig {
  if (!input || typeof input !== "object") throw new Error("workspace_config_invalid");
  const value = input as any;
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1 || typeof value.workspaceId !== "string" || !value.workspaceId || typeof value.name !== "string") throw new Error("workspace_config_invalid");
  if (!value.database || !["workspace", "appData"].includes(value.database.mode) || typeof value.database.path !== "string") throw new Error("workspace_database_config_invalid");
  if (!value.service || !["onWorkspaceOpen", "onDemand", "manual"].includes(value.service.startupMode) || !["onEditorClose", "idle", "keepRunning"].includes(value.service.shutdownMode) || !Number.isFinite(value.service.idleTimeoutMinutes) || value.service.idleTimeoutMinutes <= 0) throw new Error("workspace_service_config_invalid");
  if (!value.backup || typeof value.backup.enabled !== "boolean" || !Number.isInteger(value.backup.retentionCount) || value.backup.retentionCount < 1) throw new Error("workspace_backup_config_invalid");
  if (!value.notes || typeof value.notes.rootDirectory !== "string" || !Number.isInteger(value.notes.maximumCategoryDepth) || value.notes.maximumCategoryDepth < 0) throw new Error("workspace_notes_config_invalid");
  return value as WorkspaceConfig;
}
