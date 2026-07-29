import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const ignored = new Set([".git", ".ai", "node_modules", "dist", "build", "coverage", "data"]);
const textExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".yml", ".yaml", ".sql", ".ps1"]);
const mojibake = new RegExp(
  [0x7e3a, 0x7e67, 0x8b41, 0x9015, 0x83f4, 0x8708, 0x83a8, 0x83a8, 0x83b2].map((codePoint) => String.fromCodePoint(codePoint)).join(""),
  "u"
);
const decoder = new TextDecoder("utf-8", { fatal: true });
const failures = [];

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (textExtensions.has(entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase())) {
      try {
        const text = decoder.decode(readFileSync(path));
        if (text.includes("\uFFFD") || mojibake.test(text)) {
          failures.push(`${relative(root, path)}: suspected mojibake or replacement character`);
        }
      } catch {
        failures.push(`${relative(root, path)}: invalid UTF-8`);
      }
    }
  }
}

visit(root);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("UTF-8 encoding check passed.");
}
