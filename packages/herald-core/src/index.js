'use strict';
/**
 * herald-core — the model-agnostic, zero-ESMC-dependency context-virtualization engine.
 *
 * Three primitives, one loop:
 *   LOCATE  — compress a raw file into a navigable [Lxx] index, cache it.
 *   ROUTE   — given a problem statement, return surgical {offset,limit} re-read ranges.
 *   The host attaches enforcement (hook / MCP / skill) — see ../../adapters/.
 *
 * The engine never imports a model SDK. The host injects its model via
 * `ambientComplete` (ambient-first) or wires a `vendorComplete` for a configured
 * cheap model. That injection point is the whole reason Herald is LLM-agnostic.
 */

const fs = require('fs');
const path = require('path');
const cache = require('./cache');
const indexer = require('./indexer');
const router = require('./router');
const { resolveVendor } = require('./vendor-adapter');

/**
 * locate(filePath, opts) → { status, ... }
 *   status: 'skip_small' | 'cache_hit' | 'compressed' | 'no_backend' | 'not_found'
 * opts.ambientComplete / opts.vendorComplete / opts.cacheDir / opts.vendorConfigPath
 *
 * Cache-first. On miss, builds the index via the resolved vendor and caches it.
 * If no backend is wired (pure ambient, no fn) → returns 'no_backend' so the host
 * can fall back to a raw read instead of hard-exiting (the :752 fix).
 */
async function locate(filePath, opts = {}) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) return { status: 'not_found', file: abs };

  const raw = fs.readFileSync(abs, 'utf8');
  const lineCount = raw.split('\n').length;
  if (lineCount <= cache.THRESHOLD_LINES) {
    return { status: 'skip_small', lines: lineCount, action: 'read_directly' };
  }

  const hit = cache.check(abs, opts);
  if (hit.hit && !hit.stale) {
    return { status: 'cache_hit', ...hit };
  }

  const vendor = resolveVendor(opts);
  if (!vendor.complete) {
    // Rung 4 — nothing resolvable; don't hard-exit, tell the host to read raw.
    return { status: 'no_backend', lines: lineCount, action: 'read_directly', vendor: vendor.mode };
  }

  let summaryData;
  try {
    summaryData = await indexer.buildIndex(raw, path.basename(abs), vendor);
  } catch (err) {
    // A resolved adapter that can't actually run (missing SDK/key/server) degrades:
    // fall back to an explicitly-injected ambient fn, else read raw. Never hard-exit.
    if (err.code === 'NO_BACKEND' || err.code === 'ADAPTER_UNAVAILABLE') {
      if (opts.ambientComplete && vendor.complete !== opts.ambientComplete) {
        try {
          summaryData = await indexer.buildIndex(raw, path.basename(abs), {
            complete: opts.ambientComplete,
          });
        } catch (e2) {
          return { status: 'no_backend', lines: lineCount, action: 'read_directly', reason: e2.message };
        }
      } else {
        return { status: 'no_backend', lines: lineCount, action: 'read_directly', reason: err.message };
      }
    } else {
      throw err;
    }
  }
  const entry = cache.write(abs, summaryData, opts);
  return {
    status: 'compressed',
    summary: entry.summary,
    key_findings: entry.key_findings,
    original_lines: entry.original_lines,
    vendor: vendor.mode,
  };
}

/**
 * route(filePath, problem, opts) → { recommend, reads, ... }
 * Pure (no model call). Returns surgical ranges from the cached index.
 */
function route(filePath, problem, opts = {}) {
  const hit = cache.check(filePath, opts);
  if (!hit.hit) return { recommend: 'whole_file', reason: hit.reason, reads: [] };
  if (hit.stale) return { recommend: 'whole_file', reason: 'stale_index', reads: [] };
  return router.route(hit, problem);
}

module.exports = {
  locate,
  route,
  check: cache.check,
  write: cache.write,
  clear: cache.clear,
  stats: cache.stats,
  resolveVendor,
  THRESHOLD_LINES: cache.THRESHOLD_LINES,
  _internal: { cache, indexer, router },
};
