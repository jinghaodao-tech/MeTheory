import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
await build({ entryPoints:[resolve(root,"src/extension.ts")], outfile:resolve(root,"dist/extension.js"), bundle:true, platform:"node", format:"cjs", external:["vscode"], target:"node24" });
