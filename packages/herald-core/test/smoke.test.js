'use strict';
/**
 * herald-core smoke test — no external deps, no real model.
 * Uses a FAKE ambientComplete that returns a deterministic [Lxx] index, then
 * verifies the full loop: locate (compress) → cache hit → route (surgical ranges).
 * Run: node test/smoke.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const herald = require('../src/index');

let pass = 0;
function ok(name) { console.log(`  ✓ ${name}`); pass++; }

(async () => {
  // Temp workspace
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'herald-smoke-'));
  const cacheDir = path.join(tmp, 'cache');
  const target = path.join(tmp, 'sample.js');

  // 120-line file so it's over THRESHOLD_LINES (50) but in single-pass range.
  const body = Array.from({ length: 120 }, (_, i) => `// line ${i + 1} content here`);
  body[41] = 'function authenticateUser(token) { return verify(token); } // L42';
  body[80] = 'function refreshSession(id) { return rotate(id); } // L81';
  fs.writeFileSync(target, body.join('\n'));

  // Fake model: returns findings with [Lxx] refs that route() can match.
  const ambientComplete = async (_sys, _user) => ({
    summary: 'Auth helpers: authenticateUser and refreshSession.',
    key_findings: [
      'authenticateUser() [L42]: verifies a token',
      'refreshSession() [L81]: rotates a session id',
    ],
    relevant_sections: 'authenticateUser L42, refreshSession L81',
  });
  const opts = { cacheDir, ambientComplete };

  // 1. locate → compresses (cache miss → compressed)
  const r1 = await herald.locate(target, opts);
  assert.strictEqual(r1.status, 'compressed', `expected compressed, got ${r1.status}`);
  assert.ok(r1.key_findings.length === 2, 'two findings indexed');
  ok('locate() compresses on cache miss');

  // 2. locate again → cache hit (no model call needed)
  const r2 = await herald.locate(target, opts);
  assert.strictEqual(r2.status, 'cache_hit', `expected cache_hit, got ${r2.status}`);
  ok('locate() returns cache_hit on second call');

  // 3. route → surgical ranges for "authenticate token" → should hit L42 window
  const r3 = herald.route(target, 'authenticate user token verification', opts);
  assert.strictEqual(r3.recommend, 'targeted', `expected targeted, got ${r3.recommend}`);
  assert.ok(r3.reads.length >= 1, 'at least one surgical read');
  const hitsL42 = r3.reads.some((rd) => rd.offset <= 42 && rd.offset + rd.limit - 1 >= 42);
  assert.ok(hitsL42, 'a surgical range covers L42 (authenticateUser)');
  ok('route() returns surgical range covering the relevant line');

  // 4. ambient-first :752 fix → no backend wired → no hard-exit, read_directly
  const r4 = await herald.locate(target, { cacheDir: path.join(tmp, 'cache2') });
  assert.strictEqual(r4.status, 'no_backend', `expected no_backend, got ${r4.status}`);
  assert.strictEqual(r4.action, 'read_directly', 'degrades to read_directly, never hard-exits');
  ok('no backend → graceful read_directly (the :752 fix)');

  // 5. small file → skip
  const small = path.join(tmp, 'small.txt');
  fs.writeFileSync(small, 'a\nb\nc\n');
  const r5 = await herald.locate(small, opts);
  assert.strictEqual(r5.status, 'skip_small', 'tiny file skipped');
  ok('small file skipped (below threshold)');

  // 6. stats reflect cached entry
  const s = herald.stats(opts);
  assert.ok(s.entries >= 1 && s.total_tokens_saved_est > 0, 'stats report savings');
  ok('stats() reports cache entries + token savings');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n✅ herald-core smoke: ${pass}/6 passed\n`);
})().catch((e) => {
  console.error('\n❌ smoke test failed:', e.message);
  process.exit(1);
});
