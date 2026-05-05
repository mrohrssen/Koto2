import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createStore(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  function ensureColumn(tableName, columnName, definition) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    if (!columns.some(column => column.name === columnName)) {
      db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
    }
  }

  ensureColumn('daily_snapshots', 'fusions_performed', 'INTEGER DEFAULT 0');

  // --- Profiles ---

  const insertProfile = db.prepare(
    'INSERT INTO profiles (name, config) VALUES (?, ?)'
  );
  const selectProfile = db.prepare('SELECT * FROM profiles WHERE id = ?');
  const selectAllProfiles = db.prepare(
    'SELECT * FROM profiles ORDER BY created_at DESC'
  );
  const updateProfileStmt = db.prepare(
    'UPDATE profiles SET name = ?, config = ?, updated_at = datetime(\'now\') WHERE id = ?'
  );
  const deleteEventsForSim = db.prepare(
    'DELETE FROM events WHERE simulation_id IN (SELECT id FROM simulations WHERE profile_id = ?)'
  );
  const deleteSnapshotsForSim = db.prepare(
    'DELETE FROM daily_snapshots WHERE simulation_id IN (SELECT id FROM simulations WHERE profile_id = ?)'
  );
  const deleteSimsForProfile = db.prepare(
    'DELETE FROM simulations WHERE profile_id = ?'
  );
  const deleteProfileStmt = db.prepare('DELETE FROM profiles WHERE id = ?');

  // --- Simulations ---

  const insertSimulation = db.prepare(
    'INSERT INTO simulations (profile_id) VALUES (?)'
  );
  const selectSimulation = db.prepare('SELECT * FROM simulations WHERE id = ?');
  const selectSimsForProfile = db.prepare(
    'SELECT * FROM simulations WHERE profile_id = ? ORDER BY created_at DESC'
  );

  const SIMULATION_FIELDS = new Set([
    'status', 'test_user_id', 'jwt_token', 'current_day',
    'current_run', 'current_room', 'started_at', 'completed_at', 'error_message'
  ]);

  // --- Events ---

  const insertEvent = db.prepare(
    'INSERT INTO events (simulation_id, day, run, room, event_type, data) VALUES (?, ?, ?, ?, ?, ?)'
  );

  // --- Snapshots ---

  const insertSnapshot = db.prepare(`
    INSERT OR REPLACE INTO daily_snapshots
      (simulation_id, day, total_known_words, new_words_today, words_exposed_today,
       dialogue_lines_encountered, runs_completed, runs_wiped, rooms_explored,
       speed_reviews_completed, fusions_performed, unknown_words_in_dialogue, snapshot_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const selectSnapshots = db.prepare(
    'SELECT * FROM daily_snapshots WHERE simulation_id = ? ORDER BY day ASC'
  );

  return {
    // --- Profiles ---
    createProfile(name, config) {
      const result = insertProfile.run(name, JSON.stringify(config));
      return result.lastInsertRowid;
    },

    getProfile(id) {
      const row = selectProfile.get(id);
      if (row) row.config = JSON.parse(row.config);
      return row || null;
    },

    getAllProfiles() {
      const rows = selectAllProfiles.all();
      for (const row of rows) row.config = JSON.parse(row.config);
      return rows;
    },

    updateProfile(id, name, config) {
      return updateProfileStmt.run(name, JSON.stringify(config), id);
    },

    deleteProfile(id) {
      const del = db.transaction(() => {
        deleteEventsForSim.run(id);
        deleteSnapshotsForSim.run(id);
        deleteSimsForProfile.run(id);
        deleteProfileStmt.run(id);
      });
      del();
    },

    // --- Simulations ---
    createSimulation(profileId) {
      const result = insertSimulation.run(profileId);
      return result.lastInsertRowid;
    },

    getSimulation(id) {
      return selectSimulation.get(id) || null;
    },

    getSimulationsForProfile(profileId) {
      return selectSimsForProfile.all(profileId);
    },

    updateSimulation(id, fields) {
      const setClauses = [];
      const values = [];
      for (const [key, value] of Object.entries(fields)) {
        if (!SIMULATION_FIELDS.has(key)) continue;
        setClauses.push(`${key} = ?`);
        values.push(value);
      }
      if (setClauses.length === 0) return;
      values.push(id);
      db.prepare(
        `UPDATE simulations SET ${setClauses.join(', ')} WHERE id = ?`
      ).run(...values);
    },

    // --- Events ---
    logEvent(simId, day, run, room, eventType, data) {
      insertEvent.run(
        simId, day, run, room, eventType,
        typeof data === 'string' ? data : JSON.stringify(data)
      );
    },

    getEvents(simId, filters = {}) {
      let sql = 'SELECT * FROM events WHERE simulation_id = ?';
      const params = [simId];

      if (filters.day !== undefined) {
        sql += ' AND day = ?';
        params.push(filters.day);
      }
      if (filters.event_type !== undefined) {
        sql += ' AND event_type = ?';
        params.push(filters.event_type);
      }

      sql += ' ORDER BY id ASC';

      if (filters.limit !== undefined) {
        sql += ' LIMIT ?';
        params.push(filters.limit);
      }

      const rows = db.prepare(sql).all(...params);
      for (const row of rows) {
        try { row.data = JSON.parse(row.data); } catch { /* keep as string */ }
      }
      return rows;
    },

    getEventCounts(simId) {
      const rows = db.prepare(
        'SELECT event_type, COUNT(*) as count FROM events WHERE simulation_id = ? GROUP BY event_type'
      ).all(simId);
      const counts = {};
      for (const row of rows) counts[row.event_type] = row.count;
      return counts;
    },

    // --- Snapshots ---
    saveDailySnapshot(simId, day, metrics) {
      insertSnapshot.run(
        simId, day,
        metrics.total_known_words ?? 0,
        metrics.new_words_today ?? 0,
        metrics.words_exposed_today ?? 0,
        metrics.dialogue_lines_encountered ?? 0,
        metrics.runs_completed ?? 0,
        metrics.runs_wiped ?? 0,
        metrics.rooms_explored ?? 0,
        metrics.speed_reviews_completed ?? 0,
        metrics.fusions_performed ?? 0,
        metrics.unknown_words_in_dialogue ?? 0,
        metrics.snapshot_data ? JSON.stringify(metrics.snapshot_data) : null
      );
    },

    getDailySnapshots(simId) {
      const rows = selectSnapshots.all(simId);
      for (const row of rows) {
        if (row.snapshot_data) {
          try { row.snapshot_data = JSON.parse(row.snapshot_data); } catch { /* keep as string */ }
        }
      }
      return rows;
    },

    // --- Compare ---
    getComparisonData(simIds) {
      if (!simIds || simIds.length === 0) return [];
      const placeholders = simIds.map(() => '?').join(',');
      const rows = db.prepare(`
        SELECT ds.*, s.status, s.profile_id, p.name as profile_name
        FROM daily_snapshots ds
        JOIN simulations s ON ds.simulation_id = s.id
        JOIN profiles p ON s.profile_id = p.id
        WHERE ds.simulation_id IN (${placeholders})
        ORDER BY ds.simulation_id, ds.day
      `).all(...simIds);
      for (const row of rows) {
        if (row.snapshot_data) {
          try { row.snapshot_data = JSON.parse(row.snapshot_data); } catch { /* keep as string */ }
        }
      }
      return rows;
    },

    close() {
      db.close();
    }
  };
}
