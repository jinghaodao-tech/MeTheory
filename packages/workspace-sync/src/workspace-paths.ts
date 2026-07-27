import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { WorkspaceConfig } from "./workspace-config.ts";

export function resolveWorkspaceDatabase(root: string, config: WorkspaceConfig): string {
  if (config.database.mode === "workspace") return resolve(root, config.database.path);
  const appRoot = process.env.APPDATA ?? process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  return resolve(join(appRoot, "MeTheory", config.workspaceId, config.database.path));
}

export function resolveNotesRoot(root: string, config: WorkspaceConfig): string { return resolve(root, config.notes.rootDirectory); }
export function isWithinRoot(root: string, candidate: string): boolean { const base = resolve(root) + "\\"; return resolve(candidate).startsWith(base) || resolve(candidate) === resolve(root); }
export function normalizeWorkspacePath(root: string, path: string): string { const absolute = isAbsolute(path) ? path : join(root, path); if (!isWithinRoot(root, absolute)) throw new Error("workspace_path_outside_root"); return resolve(absolute); }
