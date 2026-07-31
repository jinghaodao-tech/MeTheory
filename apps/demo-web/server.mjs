import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname);
const port = Number(process.env.DEMO_PORT ?? 8200);
createServer(async (req, res) => {
  if (req.url === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(await readFile(resolve(root, "index.html"))); return; }
  res.writeHead(404); res.end("not found");
}).listen(port, "127.0.0.1", () => console.log(`MeTheory demo: http://127.0.0.1:${port}`));
