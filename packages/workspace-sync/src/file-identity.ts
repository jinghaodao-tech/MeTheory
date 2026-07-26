import { createHash } from "node:crypto";
export function fileIdentity(workspaceRoot: string, path: string): string { return createHash("sha256").update(`${workspaceRoot.replace(/[\\/]$/, "")}/${path.replace(/^[\\/]/, "")}`).digest("hex"); }
