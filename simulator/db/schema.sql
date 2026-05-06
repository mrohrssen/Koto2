CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  config TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS simulations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'pending',
  test_user_id TEXT,
  jwt_token TEXT,
  current_day INTEGER DEFAULT 0,
  current_run INTEGER DEFAULT 0,
  current_room INTEGER DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  simulation_id INTEGER NOT NULL REFERENCES simulations(id),
  day INTEGER NOT NULL,
  total_known_words INTEGER DEFAULT 0,
  new_words_today INTEGER DEFAULT 0,
  words_exposed_today INTEGER DEFAULT 0,
  dialogue_lines_encountered INTEGER DEFAULT 0,
  runs_completed INTEGER DEFAULT 0,
  runs_wiped INTEGER DEFAULT 0,
  rooms_explored INTEGER DEFAULT 0,
  speed_reviews_completed INTEGER DEFAULT 0,
  fusions_performed INTEGER DEFAULT 0,
  unknown_words_in_dialogue INTEGER DEFAULT 0,
  snapshot_data TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(simulation_id, day)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  simulation_id INTEGER NOT NULL REFERENCES simulations(id),
  day INTEGER NOT NULL,
  run INTEGER NOT NULL,
  room INTEGER,
  event_type TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_sim_day ON events(simulation_id, day);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(simulation_id, event_type);
CREATE INDEX IF NOT EXISTS idx_snapshots_sim ON daily_snapshots(simulation_id);


CREATE TABLE IF NOT EXISTS balance_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  battle_count INTEGER NOT NULL,
  creature_level INTEGER NOT NULL,
  completed_battles INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  result_data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_balance_runs_created ON balance_runs(created_at DESC);
