'use strict';
/**
 * herald-core/router — the OPERATE phase. Given a cached [Lxx] index and a problem
 * statement, returns the exact {offset,limit} ranges worth re-reading raw.
 *
 * Ported from herald-cache-cli.js:491-700 (rehydrate). Recall-liberal token overlap,
 * zero model calls — pure string math against the existing index. This is what makes
 * "surgical re-read" possible: the model reads only the relevant lines, undiluted.
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'is', 'are', 'be', 'this', 'that', 'it', 'as', 'by', 'from', 'we', 'should', 'how',
  'what', 'why', 'when', 'where', 'can', 'do', 'does', 'fix', 'add', 'use', 'make',
]);

const MERGE_GAP = 12; // coalesce windows within this many lines

function tokens(text) {
  if (!text) return [];
  const raw = String(text)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase split: OnInit -> On Init
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const out = [];
  for (const t of raw) {
    if (t.length < 2) continue;
    if (STOPWORDS.has(t)) continue;
    if (/^\d+$/.test(t)) continue;
    out.push(t);
  }
  return out;
}

function extractRefs(finding) {
  const chunkMatch = finding.match(/\[L(\d+)-(\d+)\]/);
  let chunkStart = null, chunkEnd = null;
  if (chunkMatch) {
    chunkStart = parseInt(chunkMatch[1], 10);
    chunkEnd = parseInt(chunkMatch[2], 10);
  }
  const exact = [];
  for (const m of finding.matchAll(/\[L(\d+)(?:-(\d+))?\]/g)) {
    if (m[2] !== undefined) continue; // range, handled above
    exact.push(parseInt(m[1], 10));
  }
  return { chunkStart, chunkEnd, exact };
}

function score(problemTokens, finding) {
  const fset = new Set(tokens(finding));
  if (fset.size === 0) return 0;
  let s = 0;
  for (const pt of problemTokens) if (fset.has(pt)) s += 1;
  return s;
}

function mergeRanges(windows, fileLines) {
  if (windows.length === 0) return [];
  const sorted = windows
    .map((w) => ({
      start: Math.max(1, w.start),
      end: Math.min(fileLines || w.end, w.end),
      why: w.why,
      score: w.score,
    }))
    .sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start <= last.end + MERGE_GAP) {
      last.end = Math.max(last.end, cur.end);
      last.score = Math.max(last.score, cur.score);
      if (cur.why && last.why && cur.why !== last.why) {
        last.why = last.why.length >= cur.why.length ? last.why : cur.why;
      }
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

const EXACT_PAD = 8; // lines of context around an exact [Lxx] anchor

/**
 * route(cacheEntry, problem) → { recommend, reads:[{offset,limit,why,score}], ... }
 * recommend: 'targeted' (ranges found) | 'whole_file' (no match / no index)
 * reads[].offset/limit are Read-tool ready (1-based offset, line count limit).
 */
function route(cacheEntry, problem) {
  const findings = Array.isArray(cacheEntry?.key_findings) ? cacheEntry.key_findings : [];
  const fileLines = cacheEntry?.original_lines || 0;
  if (findings.length === 0) {
    return { recommend: 'whole_file', reason: 'no_index', reads: [] };
  }
  const pTokens = tokens(problem);
  if (pTokens.length === 0) {
    return { recommend: 'whole_file', reason: 'empty_problem', reads: [] };
  }

  const windows = [];
  let matched = 0;
  for (const f of findings) {
    const s = score(pTokens, f);
    if (s <= 0) continue;
    matched++;
    const { chunkStart, chunkEnd, exact } = extractRefs(f);
    if (exact.length) {
      for (const ln of exact) {
        windows.push({ start: ln - EXACT_PAD, end: ln + EXACT_PAD, why: f.slice(0, 80), score: s });
      }
    } else if (chunkStart && chunkEnd) {
      windows.push({ start: chunkStart, end: chunkEnd, why: f.slice(0, 80), score: s });
    }
  }

  if (windows.length === 0) {
    return { recommend: 'whole_file', reason: 'no_line_refs', reads: [] };
  }

  const merged = mergeRanges(windows, fileLines).sort((a, b) => b.score - a.score);
  const reads = merged.map((w) => ({
    offset: w.start,
    limit: w.end - w.start + 1,
    why: w.why,
    score: w.score,
  }));
  return { recommend: 'targeted', matched, total_findings: findings.length, reads };
}

module.exports = { route, tokens, score, mergeRanges, extractRefs, STOPWORDS, MERGE_GAP };
