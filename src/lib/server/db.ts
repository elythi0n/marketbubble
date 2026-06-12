/**
 * Optional SQLite persistence, opt-in via DATABASE_PATH (e.g. /data/marketbubble.db on a
 * compose volume). Uses Node's built-in driver — no native module, no extra service, nothing
 * for a deployment to install. When DATABASE_PATH is unset (or the file can't be opened) the
 * app runs exactly as before: fully in-memory, state resets on restart.
 *
 * Design contract for callers: never assume the database exists. `getDb()` returns null in
 * memory-mode and every persisted feature must degrade to its in-memory behaviour — features
 * gain durability with a database, never existence.
 *
 * Server-only. Stashed on globalThis because Next instantiates this module once per route
 * bundle (and again on dev hot reloads); the connection and migrations must run once.
 */

import { DatabaseSync } from "node:sqlite";

/**
 * Append-only migration list; `PRAGMA user_version` tracks how many have run. Never edit a
 * shipped entry — add a new one (existing deployments only run what they haven't seen).
 */
const MIGRATIONS: string[] = [
  `CREATE TABLE control_kv (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );
   CREATE TABLE polls (
     id         TEXT PRIMARY KEY,
     question   TEXT NOT NULL,
     source     TEXT NOT NULL,
     options    TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     ends_at    INTEGER,
     status     TEXT NOT NULL,
     winner     TEXT
   );
   CREATE TABLE poll_voters (
     poll_id   TEXT NOT NULL,
     voter_key TEXT NOT NULL,
     option_id TEXT NOT NULL,
     PRIMARY KEY (poll_id, voter_key)
   );`,
  // Analytics: time-series samples (viewers, relay load) and the durable chatter leaderboard.
  // chatters.source_count is the last tally seen from the relay for that name — the sampler
  // adds deltas against it so counts accumulate across app AND relay restarts (see stats.ts).
  `CREATE TABLE stat_samples (
     ts     INTEGER NOT NULL,
     metric TEXT NOT NULL,
     value  REAL NOT NULL
   );
   CREATE INDEX stat_samples_metric_ts ON stat_samples (metric, ts);
   CREATE INDEX stat_samples_ts ON stat_samples (ts);
   CREATE TABLE chatters (
     platform     TEXT NOT NULL,
     name         TEXT NOT NULL,
     count        INTEGER NOT NULL,
     source_count INTEGER NOT NULL DEFAULT 0,
     updated_at   INTEGER NOT NULL,
     PRIMARY KEY (platform, name)
   );`,
  // Shared highlight images (admin "Post to X" hosts the PNG so the tweet link gets an image card).
  `CREATE TABLE share_cards (
     id         TEXT PRIMARY KEY,
     png        BLOB NOT NULL,
     created_at INTEGER NOT NULL
   );`,
  // Clip radar: auto-detected chat-velocity moments (+ the Twitch clip cut for each, when configured).
  `CREATE TABLE clip_moments (
     id            TEXT PRIMARY KEY,
     ts            INTEGER NOT NULL,
     score         INTEGER NOT NULL,
     kind          TEXT NOT NULL,
     why           TEXT NOT NULL,
     mpm           REAL NOT NULL,
     ratio         REAL NOT NULL,
     channel       TEXT,
     clip_id       TEXT,
     clip_url      TEXT,
     clip_edit_url TEXT,
     status        TEXT NOT NULL DEFAULT 'new',
     context       TEXT
   );
   CREATE INDEX clip_moments_ts ON clip_moments (ts);`,
  // Real subscriber flag on the durable chatter tally (sticky once the relay sees a SUB badge).
  `ALTER TABLE chatters ADD COLUMN sub INTEGER NOT NULL DEFAULT 0;`,
];

interface DbHolder {
  db: DatabaseSync | null;
  opened: boolean;
}

const holder: DbHolder = ((globalThis as Record<string, unknown> & { __mbDb?: DbHolder }).__mbDb ??= {
  db: null,
  opened: false,
});

function open(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  // WAL keeps reads non-blocking during writes; both files live next to the database file.
  db.exec("PRAGMA journal_mode = WAL;");

  const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
  return db;
}

/** The shared connection, or null when running without a database. */
export function getDb(): DatabaseSync | null {
  if (holder.opened) return holder.db;
  holder.opened = true;

  const path = process.env.DATABASE_PATH?.trim();
  if (!path) return null;

  try {
    holder.db = open(path);
    console.log(`[db] sqlite open at ${path}`);
  } catch (err) {
    // A broken database must not take the live show down — degrade to memory-mode loudly.
    console.error(`[db] failed to open ${path}; continuing without persistence`, err);
  }
  return holder.db;
}

/** Whether persistence is active (for capability reporting — admin status, gated UI). */
export function hasDatabase(): boolean {
  return getDb() !== null;
}
