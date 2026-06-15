#!/usr/bin/env node
/**
 * Migration drift guard.
 *
 * The MIGRATIONS array in src/lib/server/db.ts is append-only by contract: existing
 * deployments only run what they haven't seen, indexed by PRAGMA user_version. Editing
 * a shipped entry would corrupt the schema on every deployment that already ran it
 * (and SILENTLY — there'd be no error, just diverged state).
 *
 * This script hashes each entry and compares against migrations.lock. Append a new
 * migration → run `--update` to regenerate the lock. Edit a shipped one → CI fails.
 *
 *   node scripts/check-migrations.mjs            # verify (CI)
 *   node scripts/check-migrations.mjs --update   # regenerate lock after adding one
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dbPath = join(root, "src/lib/server/db.ts");
const lockPath = join(root, "migrations.lock");
const update = process.argv.includes("--update");

/** Extract every template literal inside `const MIGRATIONS: string[] = [...]`. */
function extractMigrations() {
  const src = readFileSync(dbPath, "utf8");
  const arrayMatch = src.match(/const MIGRATIONS[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!arrayMatch) throw new Error("could not find `const MIGRATIONS: ... = [...]` in db.ts");
  const body = arrayMatch[1];

  // Template literals don't contain unescaped backticks in our migrations, so a simple
  // backtick-delimited capture is sufficient. If that assumption ever breaks, this script
  // will throw rather than silently miss one — preferable to a false-pass.
  const literals = [...body.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  if (literals.length === 0) throw new Error("MIGRATIONS array parsed but contains no entries");
  return literals;
}

function hash(s) {
  return createHash("sha256").update(s).digest("hex");
}

const migrations = extractMigrations();
const currentHashes = migrations.map(hash);

if (update) {
  writeFileSync(
    lockPath,
    JSON.stringify({ version: 1, hashes: currentHashes }, null, 2) + "\n",
  );
  console.log(`✓ migrations.lock updated (${currentHashes.length} entries)`);
  process.exit(0);
}

if (!existsSync(lockPath)) {
  console.error("✗ migrations.lock is missing. Run: node scripts/check-migrations.mjs --update");
  process.exit(1);
}

const locked = JSON.parse(readFileSync(lockPath, "utf8"));
const lockedHashes = Array.isArray(locked.hashes) ? locked.hashes : [];

if (currentHashes.length < lockedHashes.length) {
  console.error(
    `✗ MIGRATIONS shrunk: lock has ${lockedHashes.length} entries, db.ts has ${currentHashes.length}.`,
  );
  console.error("  Migrations are append-only. Did you remove or reorder one?");
  process.exit(1);
}

const drift = [];
for (let i = 0; i < lockedHashes.length; i++) {
  if (currentHashes[i] !== lockedHashes[i]) drift.push(i);
}

if (drift.length > 0) {
  console.error(`✗ ${drift.length} shipped migration(s) were edited (indices: ${drift.join(", ")}).`);
  console.error("  Migrations are append-only — existing deployments only re-run what they");
  console.error("  haven't seen. Add a new entry instead of editing a shipped one.");
  console.error("  If this edit is intentional (pre-release, never deployed), regenerate the lock:");
  console.error("    node scripts/check-migrations.mjs --update");
  process.exit(1);
}

const added = currentHashes.length - lockedHashes.length;
if (added > 0) {
  console.error(`✗ ${added} new migration(s) appended but migrations.lock wasn't updated.`);
  console.error("  After adding migrations, run: node scripts/check-migrations.mjs --update");
  process.exit(1);
}

console.log(`✓ ${currentHashes.length} migration(s) unchanged from lock`);
