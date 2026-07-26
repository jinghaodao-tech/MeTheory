import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginDirectory = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [resolve(pluginDirectory, "src", "main.ts")],
  outfile: resolve(pluginDirectory, "main.js"),
  bundle: true,
  platform: "browser",
  format: "cjs",
  target: "es2022",
  external: ["obsidian"],
});
