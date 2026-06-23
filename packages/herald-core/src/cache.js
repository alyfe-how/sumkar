'use strict';
/**
 * herald-core/cache — disk-backed, mtime-validated compressed-summary store.
 *
 * Ported from ESMC herald-cache-cli.js (the cache layer only). Zero ESMC imports.
 * Cache key = md5(absolute path). Each entry stores the [Lxx] index + summary.
 * mtime validation makes a hit safe: if the file changed since compression, the
 * cached index is stale and the caller is told to recompress.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const THRESHOLD_LINES = 50; // files at/below this are too small to index

function defaultCacheDir() {
  // Standalone default: a .herald dir under the cwd. Overridable via opts.cacheDir.
  return path.join(process.cwd(), '.herald', 'cache');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function cacheKey(filePath) {
  const abs = path.resolve(filePath);
  return crypto.createHash('md5').update(abs).digest('hex') + '.json';
}

function cachePath(cacheDir, filePath) {
  return path.join(cacheDir, cacheKey(filePath));
}

function fileMtime(filePath) {
  try {
    return fs.statSync(path.resolve(filePath)).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * check(filePath, opts) → { hit, stale, summary, key_findings, original_lines } | { hit:false, reason }
 * Pure read — never compresses. mtime mismatch reports hit:true + stale:true so
 * the caller decides whether to trust the index or recompress.
 */
function check(filePath, opts = {}) {
  const cacheDir = opts.cacheDir || defaultCacheDir();
  const cp = cachePath(cacheDir, filePath);
  if (!fs.existsSync(cp)) return { hit: false, reason: 'no_cache' };
  let entry;
  try {
    entry = JSON.parse(fs.readFileSync(cp, 'utf8'));
  } catch {
    return { hit: false, reason: 'cache_corrupt' };
  }
  const current = fileMtime(filePath);
  const stale = current !== null && current !== entry.mtime;
  return {
    hit: true,
    stale,
    summary: entry.summary || '',
    key_findings: Array.isArray(entry.key_findings) ? entry.key_findings : [],
    original_lines: entry.original_lines || 0,
    mtime: entry.mtime,
  };
}

/** write(filePath, summaryData, opts) → persists an index entry, returns the entry. */
function write(filePath, summaryData, opts = {}) {
  const cacheDir = opts.cacheDir || defaultCacheDir();
  ensureDir(cacheDir);
  const abs = path.resolve(filePath);
  const entry = {
    file_path: abs,
    mtime: fileMtime(filePath),
    cached_at: new Date().toISOString(),
    summary: summaryData.summary || '',
    key_findings: Array.isArray(summaryData.key_findings) ? summaryData.key_findings : [],
    relevant_sections: summaryData.relevant_sections || '',
    original_lines: summaryData.original_lines || 0,
  };
  fs.writeFileSync(cachePath(cacheDir, filePath), JSON.stringify(entry, null, 2));
  return entry;
}

function clear(filePath, opts = {}) {
  const cacheDir = opts.cacheDir || defaultCacheDir();
  if (filePath) {
    const cp = cachePath(cacheDir, filePath);
    if (fs.existsSync(cp)) fs.unlinkSync(cp);
    return { cleared: 1 };
  }
  if (!fs.existsSync(cacheDir)) return { cleared: 0 };
  const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith('.json'));
  files.forEach((f) => fs.unlinkSync(path.join(cacheDir, f)));
  return { cleared: files.length };
}

function stats(opts = {}) {
  const cacheDir = opts.cacheDir || defaultCacheDir();
  if (!fs.existsSync(cacheDir)) return { entries: 0, total_tokens_saved_est: 0 };
  const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith('.json'));
  let saved = 0;
  for (const f of files) {
    try {
      const e = JSON.parse(fs.readFileSync(path.join(cacheDir, f), 'utf8'));
      // ~7 tokens/line raw vs the compact index — same heuristic as ESMC ledger.
      saved += Math.round((e.original_lines || 0) * 7);
    } catch { /* skip corrupt */ }
  }
  return { entries: files.length, total_tokens_saved_est: saved };
}

module.exports = {
  THRESHOLD_LINES,
  defaultCacheDir,
  cacheKey,
  cachePath,
  fileMtime,
  check,
  write,
  clear,
  stats,
};
