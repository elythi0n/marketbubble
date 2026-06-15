/**
 * Contract suite for the Db interface: runs the same assertions against every backend so
 * the two implementations stay behaviorally identical. New adapters drop in here — write
 * a factory and the same tests run against it.
 *
 *   npm test                           # node:sqlite only
 *   TURSO_DATABASE_URL=…  npm test     # both, including Turso
 *
 * The Turso half uses random table suffixes so concurrent CI runs against one shared
 * database don't step on each other. The node:sqlite half writes to a tmpdir.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import { createClient } from "@libsql/client";

import { type Db, NodeSqliteDb, TursoDb } from "../src/lib/server/db.ts";

interface BackendCase {
  name: string;
  factory: () => Promise<{ db: Db; cleanup: () => Promise<void> }>;
}

const cases: BackendCase[] = [
  {
    name: "node:sqlite",
    factory: async () => {
      const dir = mkdtempSync(join(tmpdir(), "mb-test-"));
      const path = join(dir, "test.db");
      const sqlite = new DatabaseSync(path);
      const db = new NodeSqliteDb(sqlite);
      return {
        db,
        cleanup: async () => {
          sqlite.close();
          rmSync(dir, { recursive: true, force: true });
        },
      };
    },
  },
];

if (process.env.TURSO_DATABASE_URL?.trim()) {
  cases.push({
    name: "turso",
    factory: async () => {
      const client = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined,
      });
      const db = new TursoDb(client);
      // No per-test cleanup of the migration tables — they're shared. The sandbox tables
      // each test creates are namespaced by suite/test, so they don't collide.
      return { db, cleanup: async () => client.close() };
    },
  });
} else {
  console.log("(skipping Turso half — set TURSO_DATABASE_URL to include it)");
}

for (const c of cases) {
  describe(`Db contract — ${c.name}`, () => {
    let db: Db;
    let cleanup: () => Promise<void>;
    // Random suffix so multiple test runs against one shared Turso db don't collide.
    const suite = `t_${randomBytes(4).toString("hex")}`;
    const tValues = `${suite}_values`;
    const tUnique = `${suite}_unique`;

    before(async () => {
      ({ db, cleanup } = await c.factory());
      await db.exec(`CREATE TABLE ${tValues} (id INTEGER PRIMARY KEY, txt TEXT, num INTEGER, blb BLOB)`);
      await db.exec(`CREATE TABLE ${tUnique} (k TEXT PRIMARY KEY, v INTEGER)`);
    });

    after(async () => {
      try {
        await db.exec(`DROP TABLE IF EXISTS ${tValues}`);
        await db.exec(`DROP TABLE IF EXISTS ${tUnique}`);
      } catch {
        /* best-effort */
      }
      await cleanup();
    });

    it("get() returns undefined for empty result", async () => {
      const row = await db.get(`SELECT 1 AS v FROM ${tValues} WHERE 1 = 0`);
      assert.equal(row, undefined);
    });

    it("get() returns the first row", async () => {
      const row = await db.get<{ v: number }>("SELECT 42 AS v");
      assert.deepEqual(row, { v: 42 });
    });

    it("all() returns multiple rows in order", async () => {
      const rows = await db.all<{ x: number }>("SELECT 1 AS x UNION ALL SELECT 2 UNION ALL SELECT 3");
      assert.deepEqual(rows.map((r) => r.x), [1, 2, 3]);
    });

    it("run() reports changes for INSERT, UPDATE, DELETE", async () => {
      await db.exec(`DELETE FROM ${tValues}`);
      const ins = await db.run(`INSERT INTO ${tValues} (txt) VALUES (?)`, ["a"]);
      assert.equal(ins.changes, 1);
      const upd = await db.run(`UPDATE ${tValues} SET txt = ?`, ["b"]);
      assert.equal(upd.changes, 1);
      const del = await db.run(`DELETE FROM ${tValues}`);
      assert.equal(del.changes, 1);
    });

    it("round-trips SqlValue types (string, number, null, BLOB)", async () => {
      await db.exec(`DELETE FROM ${tValues}`);
      const blob = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
      await db.run(
        `INSERT INTO ${tValues} (id, txt, num, blb) VALUES (?, ?, ?, ?)`,
        [1, "hello world", 12345, blob],
      );
      const row = await db.get<{ id: number; txt: string; num: number; blb: Uint8Array | null }>(
        `SELECT id, txt, num, blb FROM ${tValues} WHERE id = ?`,
        [1],
      );
      assert.ok(row, "row should exist");
      assert.equal(row!.id, 1);
      assert.equal(row!.txt, "hello world");
      assert.equal(row!.num, 12345);
      assert.ok(row!.blb instanceof Uint8Array, "BLOB should read back as Uint8Array");
      assert.deepEqual(Array.from(row!.blb!), Array.from(blob), "BLOB bytes should match");
    });

    it("preserves null vs missing", async () => {
      await db.exec(`DELETE FROM ${tValues}`);
      await db.run(`INSERT INTO ${tValues} (id, txt) VALUES (?, ?)`, [2, null]);
      const row = await db.get<{ txt: string | null }>(`SELECT txt FROM ${tValues} WHERE id = ?`, [2]);
      assert.equal(row?.txt, null);
    });

    it("batch() is transactional — failure rolls back prior statements", async () => {
      await db.exec(`DELETE FROM ${tUnique}`);
      await db.run(`INSERT INTO ${tUnique} (k, v) VALUES (?, ?)`, ["existing", 1]);

      await assert.rejects(
        db.batch([
          { sql: `INSERT INTO ${tUnique} (k, v) VALUES (?, ?)`, params: ["fresh", 1] },
          // PRIMARY KEY conflict — without ON CONFLICT clause, this throws and the txn rolls back
          { sql: `INSERT INTO ${tUnique} (k, v) VALUES (?, ?)`, params: ["existing", 2] },
        ]),
      );

      const fresh = await db.get(`SELECT v FROM ${tUnique} WHERE k = ?`, ["fresh"]);
      assert.equal(fresh, undefined, "the first statement should have been rolled back");
      const existing = await db.get<{ v: number }>(`SELECT v FROM ${tUnique} WHERE k = ?`, ["existing"]);
      assert.equal(existing?.v, 1, "the prior row should be untouched");
    });

    it("batch() commits when every statement succeeds", async () => {
      await db.exec(`DELETE FROM ${tUnique}`);
      await db.batch([
        { sql: `INSERT INTO ${tUnique} (k, v) VALUES (?, ?)`, params: ["a", 1] },
        { sql: `INSERT INTO ${tUnique} (k, v) VALUES (?, ?)`, params: ["b", 2] },
        { sql: `INSERT INTO ${tUnique} (k, v) VALUES (?, ?)`, params: ["c", 3] },
      ]);
      const rows = await db.all<{ k: string }>(`SELECT k FROM ${tUnique} ORDER BY k`);
      assert.deepEqual(rows.map((r) => r.k), ["a", "b", "c"]);
    });

    it("ON CONFLICT(col) DO UPDATE SET col = excluded.col works", async () => {
      await db.exec(`DELETE FROM ${tUnique}`);
      await db.run(`INSERT INTO ${tUnique} (k, v) VALUES (?, ?)`, ["x", 100]);
      await db.run(
        `INSERT INTO ${tUnique} (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`,
        ["x", 200],
      );
      const row = await db.get<{ v: number }>(`SELECT v FROM ${tUnique} WHERE k = ?`, ["x"]);
      assert.equal(row?.v, 200);
    });

    it("migrations ran — app schema tables exist", async () => {
      // The constructor runs MIGRATIONS, so every adapter that booted should already have these.
      const wanted = ["control_kv", "polls", "poll_voters", "stat_samples", "chatters", "share_cards", "clip_moments"];
      const tables = await db.all<{ name: string }>(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      );
      const have = new Set(tables.map((t) => t.name));
      for (const t of wanted) {
        assert.ok(have.has(t), `expected table ${t} to exist after migrations (got ${[...have].join(", ")})`);
      }
    });
  });
}
