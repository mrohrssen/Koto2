import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'fs';
import { dataPath } from './data-dir.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  encrypted_api_keys TEXT,
  created_at TEXT NOT NULL,
  is_bot INTEGER NOT NULL DEFAULT 0,
  bot_profile TEXT
);
CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  used_by TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_user_ts ON reviews(user_id, ts);
CREATE TABLE IF NOT EXISTS kanji_kombat_runs (
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  wave INTEGER NOT NULL,
  waves_cleared INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kk_runs_ts ON kanji_kombat_runs(ts);
`;

let db = null;
let dbPath = null;

/** Singleton keyed to the current data dir (test overrides reopen automatically). */
export function getDb() {
  const wanted = dataPath('koto.db');
  if (db && dbPath === wanted) return db;
  if (db) { try { db.close(); } catch { /* already closed */ } }
  db = new Database(wanted);
  dbPath = wanted;
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  return db;
}

export function resetDbForTest() {
  if (db) { try { db.close(); } catch { /* already closed */ } }
  db = null;
  dbPath = null;
}

/**
 * One-time import of the legacy users JSON. Runs only when the users table
 * is empty and the file exists. The JSON file is never modified or deleted —
 * it remains a frozen pre-migration backup.
 */
export function migrateUsersJsonIfNeeded(jsonPath) {
  const database = getDb();
  const count = database.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0 || !jsonPath || !existsSync(jsonPath)) {
    return { migrated: false, users: 0 };
  }

  let data;
  try {
    data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  } catch (e) {
    console.error('[DB] Legacy users JSON unreadable, skipping import:', e.message);
    return { migrated: false, users: 0 };
  }

  const users = Array.isArray(data.users) ? data.users : [];
  const invites = Array.isArray(data.inviteCodes) ? data.inviteCodes : [];

  const insertUser = database.prepare(`
    INSERT INTO users (id, username, password_hash, encrypted_api_keys, created_at, is_bot, bot_profile)
    VALUES (@id, @username, @passwordHash, @encryptedApiKeys, @createdAt, @isBot, @botProfile)
  `);
  const insertInvite = database.prepare(
    'INSERT INTO invite_codes (code, used_by, created_at) VALUES (@code, @usedBy, @createdAt)'
  );
  const insertReview = database.prepare('INSERT INTO reviews (user_id, ts) VALUES (?, ?)');
  const insertRun = database.prepare(
    'INSERT INTO kanji_kombat_runs (user_id, ts, wave, waves_cleared) VALUES (?, ?, ?, ?)'
  );

  const importAll = database.transaction(() => {
    for (const user of users) {
      insertUser.run({
        id: user.id,
        username: user.username,
        passwordHash: user.passwordHash,
        encryptedApiKeys: user.encryptedApiKeys ? JSON.stringify(user.encryptedApiKeys) : null,
        createdAt: user.createdAt || new Date().toISOString(),
        isBot: user.isBot ? 1 : 0,
        botProfile: user.botProfile ? JSON.stringify(user.botProfile) : null,
      });
      for (const review of user.reviews || []) {
        if (Number.isFinite(review?.ts)) insertReview.run(user.id, review.ts);
      }
      for (const run of user.kanjiKombatRuns || []) {
        if (Number.isFinite(run?.ts)) insertRun.run(user.id, run.ts, run.wave || 1, run.wavesCleared || 0);
      }
    }
    for (const invite of invites) {
      insertInvite.run({
        code: invite.code,
        usedBy: invite.usedBy || null,
        createdAt: invite.createdAt || new Date().toISOString(),
      });
    }
  });
  importAll();

  console.log(`[DB] Imported legacy users JSON: ${users.length} users, ${invites.length} invite codes (${jsonPath})`);
  return { migrated: true, users: users.length };
}
