#!/usr/bin/env node
/**
 * Smoke test — boots the production server with persistence enabled, hits a handful of
 * endpoints, asserts non-error responses, and tears down. Catches integration regressions
 * (DB wiring, route handlers, env reading) that the unit tests don't see.
 *
 * Prereq: `npm run build` first — this script runs `next start` against the existing build.
 *
 *   npm run build && npm run smoke
 *
 * Uses a tmp SQLite file so it never collides with the dev database.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = process.env.SMOKE_PORT ? Number(process.env.SMOKE_PORT) : 3199;
const ADMIN_KEY = "smoke-test-key-do-not-use-in-prod";
const BOOT_TIMEOUT_MS = 30_000;

const dir = mkdtempSync(join(tmpdir(), "mb-smoke-"));
const dbPath = join(dir, "smoke.db");

const proc = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(PORT),
    HOSTNAME: "127.0.0.1",
    DATABASE_PATH: dbPath,
    ADMIN_API_KEY: ADMIN_KEY,
    NEXT_PUBLIC_DEMO_DISABLED: "1",
    // Don't trigger external bridges/bridges during smoke.
    X_BROADCAST_SOURCES: "",
    STREAMERS_JSON: "[]",
    RELAY_URL: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
proc.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

/** Resolves when the server prints its "Ready" line, rejects on timeout. */
function waitForReady() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server didn't ready in ${BOOT_TIMEOUT_MS}ms`)), BOOT_TIMEOUT_MS);
    proc.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("Ready in")) {
        clearTimeout(timer);
        resolve();
      }
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early with code ${code}\nstderr: ${stderr.slice(-500)}`));
    });
  });
}

async function fetchJson(path, init = {}) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, init);
  return { status: res.status, body: await res.json().catch(() => null) };
}

const adminHeaders = { "x-admin-key": ADMIN_KEY };

const checks = [
  {
    name: "GET /api/leaderboard/chatters (uses db.all)",
    run: async () => {
      const r = await fetchJson("/api/leaderboard/chatters");
      assert(r.status === 200, `status ${r.status}`);
      assert(Array.isArray(r.body?.chatters), "expected chatters array");
    },
  },
  {
    name: "GET /api/chatter (uses db.get + count) — unknown user returns nulls",
    run: async () => {
      const r = await fetchJson("/api/chatter?name=does-not-exist&platform=twitch");
      assert(r.status === 200, `status ${r.status}`);
      assert(r.body?.allTime === null && r.body?.rank === null, "expected null fields");
    },
  },
  {
    name: "GET /api/admin/status (auth + db.get) — database.ok = true",
    run: async () => {
      const r = await fetchJson("/api/admin/status", { headers: adminHeaders });
      assert(r.status === 200, `status ${r.status}`);
      assert(r.body?.database?.ok === true, `expected database.ok=true, got ${JSON.stringify(r.body?.database)}`);
      assert(r.body?.database?.configured === true, "expected database.configured=true");
    },
  },
  {
    name: "GET /api/admin/giveaway (uses db.all with WHERE/params)",
    run: async () => {
      const r = await fetchJson("/api/admin/giveaway?minCount=1", { headers: adminHeaders });
      assert(r.status === 200, `status ${r.status}`);
      assert(typeof r.body?.eligible === "number", "expected eligible to be a number");
    },
  },
  {
    name: "POST /api/admin/clip-radar then GET (db.run write + db.get read)",
    run: async () => {
      const post = await fetchJson("/api/admin/clip-radar", {
        method: "POST",
        headers: { ...adminHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ sensitivity: "high", cooldownSec: 90 }),
      });
      assert(post.status === 200, `POST status ${post.status}`);
      assert(post.body?.config?.sensitivity === "high", "config not updated");

      const get = await fetchJson("/api/admin/clip-radar", { headers: adminHeaders });
      assert(get.body?.config?.sensitivity === "high", "config didn't persist");
      assert(get.body?.config?.cooldownSec === 90, "cooldown didn't persist");
    },
  },
  {
    name: "POST /api/admin/announcement (exercises batch() via persistState)",
    run: async () => {
      const r = await fetchJson("/api/admin/announcement", {
        method: "POST",
        headers: { ...adminHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ message: "smoke test announcement" }),
      });
      assert(r.status === 200, `status ${r.status}`);
      assert(r.body?.announcement?.message === "smoke test announcement", "announcement didn't set");

      const status = await fetchJson("/api/admin/status", { headers: adminHeaders });
      assert(
        status.body?.announcement?.message === "smoke test announcement",
        `announcement not visible via status (got ${JSON.stringify(status.body?.announcement)})`,
      );
    },
  },
  {
    name: "admin endpoints reject missing/bad keys",
    run: async () => {
      const noKey = await fetchJson("/api/admin/status");
      assert(noKey.status === 401, `expected 401 without key, got ${noKey.status}`);
      const badKey = await fetchJson("/api/admin/status", { headers: { "x-admin-key": "wrong" } });
      assert(badKey.status === 401, `expected 401 with bad key, got ${badKey.status}`);
    },
  },
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

let failed = 0;
try {
  await waitForReady();
  console.log(`server ready on :${PORT}, db at ${dbPath}\n`);

  for (const c of checks) {
    try {
      await c.run();
      console.log(`  \x1b[32m✓\x1b[0m ${c.name}`);
    } catch (err) {
      console.log(`  \x1b[31m✗\x1b[0m ${c.name}\n      ${err.message}`);
      failed++;
    }
  }
} catch (err) {
  console.error(`fatal: ${err.message}`);
  failed = checks.length;
} finally {
  proc.kill("SIGTERM");
  // Give it a moment to flush, then force-kill if still alive.
  await new Promise((r) => setTimeout(r, 500));
  proc.kill("SIGKILL");
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${failed === 0 ? "\x1b[32m" : "\x1b[31m"}${checks.length - failed}/${checks.length} checks passed\x1b[0m`);
process.exit(failed === 0 ? 0 : 1);
