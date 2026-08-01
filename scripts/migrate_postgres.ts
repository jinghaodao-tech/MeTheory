import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const connectionString = process.env.METHEORY_POSTGRES_URL;
if (!connectionString) throw new Error("METHEORY_POSTGRES_URL is required");
const pool = new Pool({ connectionString, max: Number(process.env.METHEORY_POSTGRES_POOL_MAX ?? 10) });
try {
  await pool.query(await readFile(new URL("../db/postgres_schema.sql", import.meta.url), "utf8"));
  console.log(JSON.stringify({ ok: true, driver: "postgres", scope: "pcs_analysis_history" }));
} finally { await pool.end(); }
