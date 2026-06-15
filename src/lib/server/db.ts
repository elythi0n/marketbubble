/**
 * Optional persistence with two backends — pick by env, fall back to in-memory.
 *
 *   DATABASE_PATH=/data/foo.db                    → local SQLite via node:sqlite (Docker default)
 *   TURSO_DATABASE_URL=libsql://… (+ AUTH_TOKEN)  → hosted libSQL/Turso (Vercel + serverless)
 *   neither                                       → null, every feature stays in-memory
 *
 * Both backends speak the same SQL and run the same MIGRATIONS list. Callers see one async
 * `Db` interface; the existing node:sqlite path keeps working unchanged.
 *
 * Design contract for callers: never assume the database exists. `getDb()` returns null in
 * memory-mode and every persisted feature must degrade to its in-memory behaviour — features
 * gain durability with a database, never existence.
 *
 * Server-only. Stashed on globalThis because Next instantiates this module once per route
 * bundle (and again on dev hot reloads); the connection and migrations must run once.
 */

import { DatabaseSync } from "node:sqlite";

import { type Client, createClient } from "@libsql/client";

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

export type SqlValue = string | number | bigint | null | Uint8Array;
export type Row = Record<string, unknown>;
export interface Statement {
  sql: string;
  params?: SqlValue[];
}

/**
 * Unified async interface both backends implement. Methods auto-await the migration promise
 * so callers never have to think about boot ordering.
 */
export interface Db {
  all<T = Row>(sql: string, params?: SqlValue[]): Promise<T[]>;
  get<T = Row>(sql: string, params?: SqlValue[]): Promise<T | undefined>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  /** Run one or more semicolon-separated statements (no parameters). Use for DDL. */
  exec(sql: string): Promise<void>;
  /** Run multiple statements as a single transaction. Preferred over manual BEGIN/COMMIT. */
  batch(stmts: Statement[]): Promise<void>;
}

/** Split a multi-statement SQL string on top-level `;` (the migration SQL has no string literals). */
function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Convert node:sqlite row values: BigInt → number when safe, Buffer stays as Uint8Array. */
function normalizeNodeRow(row: Record<string, unknown>): Row {
  const out: Row = {};
  for (const k of Object.keys(row)) {
    const v = row[k];
    out[k] = typeof v === "bigint" && v <= Number.MAX_SAFE_INTEGER && v >= Number.MIN_SAFE_INTEGER ? Number(v) : v;
  }
  return out;
}

export class NodeSqliteDb implements Db {
  readonly ready: Promise<void>;
  constructor(private readonly db: DatabaseSync) {
    this.ready = this.migrate();
  }

  private async migrate(): Promise<void> {
    this.db.exec("PRAGMA journal_mode = WAL;");
    const verRow = this.db.prepare("PRAGMA user_version").get() as { user_version: number };
    const version = verRow.user_version;
    for (let i = version; i < MIGRATIONS.length; i++) {
      this.db.exec("BEGIN");
      try {
        this.db.exec(MIGRATIONS[i]);
        this.db.exec(`PRAGMA user_version = ${i + 1}`);
        this.db.exec("COMMIT");
      } catch (err) {
        try {
          this.db.exec("ROLLBACK");
        } catch {
          /* not in a transaction */
        }
        throw err;
      }
    }
  }

  async all<T = Row>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    await this.ready;
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map(normalizeNodeRow) as T[];
  }

  async get<T = Row>(sql: string, params: SqlValue[] = []): Promise<T | undefined> {
    await this.ready;
    const row = this.db.prepare(sql).get(...params) as Record<string, unknown> | undefined;
    return row ? (normalizeNodeRow(row) as T) : undefined;
  }

  async run(sql: string, params: SqlValue[] = []): Promise<{ changes: number }> {
    await this.ready;
    const res = this.db.prepare(sql).run(...params);
    return { changes: Number(res.changes) };
  }

  async exec(sql: string): Promise<void> {
    await this.ready;
    this.db.exec(sql);
  }

  async batch(stmts: Statement[]): Promise<void> {
    await this.ready;
    if (stmts.length === 0) return;
    this.db.exec("BEGIN");
    try {
      for (const s of stmts) {
        this.db.prepare(s.sql).run(...(s.params ?? []));
      }
      this.db.exec("COMMIT");
    } catch (err) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* not in a transaction */
      }
      throw err;
    }
  }
}

export class TursoDb implements Db {
  readonly ready: Promise<void>;
  constructor(private readonly client: Client) {
    this.ready = this.migrate();
  }

  private async migrate(): Promise<void> {
    const verRow = await this.client.execute("PRAGMA user_version");
    const version = Number(verRow.rows[0]?.user_version ?? 0);
    for (let i = version; i < MIGRATIONS.length; i++) {
      const stmts = splitStatements(MIGRATIONS[i]);
      await this.client.batch([...stmts, `PRAGMA user_version = ${i + 1}`]);
    }
  }

  private toObject(rs: { columns: string[]; rows: Array<Record<string, unknown> & ArrayLike<unknown>> }): Row[] {
    return rs.rows.map((r) => {
      const out: Row = {};
      for (const col of rs.columns) {
        const v = r[col];
        out[col] = typeof v === "bigint" && v <= Number.MAX_SAFE_INTEGER && v >= Number.MIN_SAFE_INTEGER ? Number(v) : v;
      }
      return out;
    });
  }

  async all<T = Row>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    await this.ready;
    const rs = await this.client.execute({ sql, args: params });
    return this.toObject(rs) as T[];
  }

  async get<T = Row>(sql: string, params: SqlValue[] = []): Promise<T | undefined> {
    const rows = await this.all<T>(sql, params);
    return rows[0];
  }

  async run(sql: string, params: SqlValue[] = []): Promise<{ changes: number }> {
    await this.ready;
    const rs = await this.client.execute({ sql, args: params });
    return { changes: Number(rs.rowsAffected) };
  }

  async exec(sql: string): Promise<void> {
    await this.ready;
    await this.client.executeMultiple(sql);
  }

  async batch(stmts: Statement[]): Promise<void> {
    await this.ready;
    if (stmts.length === 0) return;
    await this.client.batch(stmts.map((s) => ({ sql: s.sql, args: s.params ?? [] })));
  }
}

interface DbHolder {
  db: Db | null;
  opened: boolean;
}

const holder: DbHolder = ((globalThis as Record<string, unknown> & { __mbDb?: DbHolder }).__mbDb ??= {
  db: null,
  opened: false,
});

function open(): Db | null {
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  if (tursoUrl) {
    try {
      const client = createClient({
        url: tursoUrl,
        authToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined,
      });
      console.log(`[db] turso open at ${tursoUrl}`);
      return new TursoDb(client);
    } catch (err) {
      console.error(`[db] failed to open turso ${tursoUrl}; continuing without persistence`, err);
      return null;
    }
  }

  const path = process.env.DATABASE_PATH?.trim();
  if (path) {
    try {
      const sqlite = new DatabaseSync(path);
      console.log(`[db] sqlite open at ${path}`);
      return new NodeSqliteDb(sqlite);
    } catch (err) {
      console.error(`[db] failed to open ${path}; continuing without persistence`, err);
      return null;
    }
  }

  return null;
}

/** The shared connection adapter, or null when running without a database. */
export function getDb(): Db | null {
  if (holder.opened) return holder.db;
  holder.opened = true;
  holder.db = open();
  return holder.db;
}

/** Whether persistence is active (for capability reporting — admin status, gated UI). */
export function hasDatabase(): boolean {
  return getDb() !== null;
}
