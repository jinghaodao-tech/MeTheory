import type * as SQLite from 'expo-sqlite';

export async function migrateLegacyObservations(db: SQLite.SQLiteDatabase) {
  const key = 'legacy_observations_v1';
  const done = await db.getFirstAsync<{ migration_key: string }>('SELECT migration_key FROM parameter_migration_runs WHERE migration_key=?', key);
  if (done) return;
  const responses = await db.getAllAsync<{ id: string; checkin_id: string; created_at: string; hypothesis_id: string | null; payload_json: string }>('SELECT r.id,r.checkin_id,r.created_at,c.hypothesis_id,r.payload_json FROM responses r JOIN checkins c ON c.id=r.checkin_id');
  for (const response of responses) {
    const episodeId = `episode_${response.id}`;
    await db.runAsync('INSERT OR IGNORE INTO observation_episodes (id,user_id,checkin_id,hypothesis_id,episode_type,capture_mode,observed_at,source_context_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)', episodeId, 'local-user', response.checkin_id, response.hypothesis_id, 'momentary_checkin', 'momentary_observation', response.created_at, '{}', response.created_at);
    const observations = await db.getAllAsync<{ field: string; value_json: string; certainty: string; source: string }>('SELECT field,value_json,certainty,source FROM observations WHERE response_id=?', response.id);
    for (const observation of observations) {
      let parameterId = observation.field; let parsed: unknown;
      try { parsed = JSON.parse(observation.value_json); } catch { continue; }
      if (parameterId === 'energy') parameterId = 'energy_level';
      if (parameterId === 'mood') parameterId = 'mood_valence';
      if (parameterId === 'activity_type') parameterId = 'activity_category';
      if (parameterId === 'completed') parameterId = 'completion_status';
      if (parameterId === 'started') parameterId = 'start_status';
      const def = await db.getFirstAsync<{ id: string; value_type: string; definition_version: string }>('SELECT id,value_type,definition_version FROM parameter_definitions WHERE id=?', parameterId);
      if (!def) continue;
      const value = def.value_type === 'boolean' && typeof parsed === 'boolean' ? [parsed ? 1 : 0, null, null, null, null, null] : ['number','integer','ordinal','duration_minutes','percentage'].includes(def.value_type) && typeof parsed === 'number' ? [null, def.value_type === 'integer' ? parsed : null, def.value_type === 'integer' ? null : parsed, null, null, null] : typeof parsed === 'string' ? [null, null, null, parsed, null, null] : [null, null, null, null, null, JSON.stringify(parsed)];
      await db.runAsync('INSERT OR IGNORE INTO parameter_values (id,episode_id,parameter_id,boolean_value,integer_value,number_value,text_value,datetime_value,json_value,observed_at,source_type,certainty,user_confirmed,parameter_version,is_missing,eligible_for_evaluation,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', `legacy_${response.id}_${parameterId}`, episodeId, parameterId, ...value, response.created_at, observation.source === 'system' ? 'system' : 'user', ['high','medium','low'].includes(observation.certainty) ? observation.certainty : 'medium', observation.source === 'user_confirmed' ? 1 : 0, def.definition_version, 0, 1, response.created_at);
    }
  }
  await db.runAsync('INSERT INTO parameter_migration_runs (migration_key,completed_at) VALUES (?,?)', key, new Date().toISOString());
}
