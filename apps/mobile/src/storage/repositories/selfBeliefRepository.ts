import { dbPromise, newId } from '../db';
export async function saveSelfBelief(statement: string) { const db = await dbPromise; const id = newId('belief'); await db.runAsync('INSERT INTO self_beliefs (id, statement, created_at) VALUES (?, ?, ?)', id, statement, new Date().toISOString()); return id; }
export async function latestSelfBelief() { const db = await dbPromise; return db.getFirstAsync<{ id: string; statement: string; created_at: string }>('SELECT * FROM self_beliefs ORDER BY created_at DESC LIMIT 1'); }
