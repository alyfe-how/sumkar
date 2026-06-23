#!/usr/bin/env node
'use strict';
/**
 * Herald-Portable — Claude Code adapter (HARD enforcement rung).
 * PreToolUse:Read hook. Fires before every Read.
 *
 * THE LAW OPTION (thread turns 5-9): on Claude Code, enforcement is real because
 * the harness runs this hook whether the model wants it or not, and exit(2) blocks
 * the raw read and substitutes the index. The model cannot bypass it. That is the
 * difference between Herald (enforced) and a pure skill (advisory).
 *
 * Enforcement table:
 *   cache HIT  + non-surgical → BLOCK(exit 2), return [Lxx] index
 *   cache HIT  + surgical     → ALLOW (editing known lines)
 *   cache MISS                → compress via herald-core, then BLOCK + return index
 *   ≤ 50 lines / binary / dotfile → ALLOW
 *
 * COMPRESSION BACKEND: herald-core resolves the model itself via the 4-rung ladder
 * (.herald-vendor.json → Anthropic/Sonnet-4.6 default → ambient → raw). So a cache
 * MISS compresses automatically using the default Sonnet adapter when
 * @herald/adapter-anthropic + ANTHROPIC_API_KEY are present; otherwise it degrades
 * to read_directly (never hard-exits — the :752 fix). Drop a .herald-vendor.json to
 * switch the compress model (Haiku, GPT, local Ollama) without touching this hook.
 */

const fs = require('fs');
const path = require('path');

// Resolve herald-core relative to this adapter (monorepo) or node_modules.
let herald;
try {
  herald = require('../../packages/herald-core/src/index.js');
} catch {
  try { herald = require('@herald/core'); }
  catch { process.exit(0); } // engine missing → never break the host
}

const CWD = process.cwd();
const CACHE_DIR = path.join(CWD, '.herald', 'cache');
const opts = { cacheDir: CACHE_DIR };

// ── Read hook payload ─────────────────────────────────────────────────────────
let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }
if (input.tool_name !== 'Read') process.exit(0);

const filePath = input.tool_input?.file_path;
if (!filePath) process.exit(0);
const absPath = path.resolve(filePath);

// ── Exemptions ────────────────────────────────────────────────────────────────
const norm = absPath.replace(/\\/g, '/');
if (norm.includes('/.herald/') || norm.includes('/.git/')) process.exit(0);

const BINARY = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.pdf', '.ipynb',
  '.mp4', '.mp3', '.wav', '.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.wasm',
]);
if (BINARY.has(path.extname(absPath).toLowerCase())) process.exit(0);

let lineCount = 0;
try { lineCount = fs.readFileSync(absPath, 'utf8').split('\n').length; }
catch { process.exit(0); }
if (lineCount <= herald.THRESHOLD_LINES) process.exit(0);

const isSurgical =
  input.tool_input.offset !== undefined && input.tool_input.limit !== undefined;

// ── Cache check ───────────────────────────────────────────────────────────────
const hit = herald.check(absPath, opts);

if (hit.hit && !hit.stale) {
  if (isSurgical) process.exit(0); // editing a known region — allow
  emitIndex(absPath, hit);
  process.exit(2); // BLOCK raw dump, model gets the index on stderr
}

// ── Cache miss → try compress (ambient). Degrades to allow if no backend. ──────
(async () => {
  let res;
  try { res = await herald.locate(absPath, opts); }
  catch { process.exit(0); } // any engine error → allow raw read, never block blindly

  if (res.status === 'compressed' || res.status === 'cache_hit') {
    emitIndex(absPath, res);
    process.exit(2);
  }
  // no_backend / skip_small / not_found → let the raw Read proceed (the :752 fix)
  process.exit(0);
})();

function emitIndex(p, data) {
  const findings = (data.key_findings || []).slice(0, 10).map((f) => `  • ${f}`).join('\n');
  process.stderr.write(
    `🔭 HERALD — ${path.basename(p)} (${data.original_lines} lines)\n` +
    `Routed you to the navigable index instead of the raw dump — nothing withheld:\n\n` +
    `Summary: ${data.summary}\n\n` +
    `Key findings (each carries [Lxx] line refs):\n${findings}\n\n` +
    `🎯 To grab exact source: Read with offset+limit on the [Lxx] range you need.\n`
  );
}
