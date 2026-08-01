import { Pool } from "pg";

const connectionString = process.env.METHEORY_POSTGRES_URL;
if (!connectionString) {
  console.log(JSON.stringify({ configured: false, driver: "postgres", reason: "METHEORY_POSTGRES_URL is not set" }));
  process.exit(0);
}
const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 3000 });
try {
  const result = await pool.query("SELECT current_database() AS database, current_setting('server_version') AS server_version");
  console.log(JSON.stringify({ configured: true, reachable: true, driver: "postgres", database: result.rows[0]?.database, serverVersion: result.rows[0]?.server_version }));
} catch (error) {
  console.error(JSON.stringify({ configured: true, reachable: false, driver: "postgres", error: error instanceof Error ? error.message : "connection_failed" }));
  process.exitCode = 1;
} finally { await pool.end(); }
