'use strict';
/**
 * herald-core/indexer — builds the navigable [Lxx] index from a RAW file.
 *
 * CRITICAL PROVENANCE (thread turn 4, verified in herald-cache-cli.js:840-869):
 * the [Lxx] line refs are produced HERE, from the file's own line offsets — they
 * are NOT consumed from any external producer (no Scribe/ATLAS dependency). That
 * self-production is exactly what makes herald-core a clean, severable organ.
 *
 *   chunkStart = i + 1   ← line number derived from THIS file's iterator
 *   finding    = `[L${start}-${end}] ${rawFinding}`  ← prefix prepended HERE
 *
 * The model call (compression) is injected via vendor.complete — the indexer
 * itself contains zero model SDK code.
 */

const CHUNK_SIZE = 500;
const OVERLAP = 50;
const MAX_FINDINGS = 60;

function getFindingsTarget(lines) {
  return lines < 200 ? 5 : lines < 600 ? 8 : 12;
}

/**
 * buildIndex(rawContent, fileName, vendor) → Promise<{summary, key_findings, original_lines, relevant_sections}>
 * vendor.complete(systemPrompt, userPrompt) → {summary, key_findings, relevant_sections?}
 * Throws if vendor.complete is null (ambient not wired) — caller decides fallback.
 */
async function buildIndex(rawContent, fileName, vendor) {
  if (!vendor || typeof vendor.complete !== 'function') {
    const err = new Error('no_compress_backend');
    err.code = 'NO_BACKEND';
    throw err;
  }

  const lines = String(rawContent).trimEnd().split('\n');
  const originalLines = lines.length;
  const findingsTarget = getFindingsTarget(originalLines);
  const systemPrompt =
    'You are a code/text compression expert. Analyze the content and return ONLY a raw ' +
    'JSON object: no explanation, no markdown, no code fences — just the JSON.';

  // ── Single-pass (≤ 600 lines) ──────────────────────────────────────────────
  if (originalLines <= 600) {
    const userPrompt =
      `File: ${fileName} (${originalLines} lines total)\n\n${rawContent}\n\n---\n` +
      `Extract exactly ${findingsTarget} key findings. Each finding MUST include a ` +
      `[Lxx] line reference (e.g. "funcName() [L42]: does X").\n\n` +
      `Return JSON: {"summary":"<2-3 sentences>","key_findings":["..."],` +
      `"relevant_sections":"<names + line ranges>","original_lines":${originalLines}}`;
    const result = await vendor.complete(systemPrompt, userPrompt);
    return normalize(result, originalLines);
  }

  // ── Chunked (> 600 lines), sequential. [L<start>-<end>] is FILE-ABSOLUTE. ───
  const chunkResults = [];
  const imports = lines.slice(0, 30).join('\n');
  for (let i = 0; i < lines.length; i += CHUNK_SIZE - OVERLAP) {
    const chunkLines = lines.slice(i, i + CHUNK_SIZE);
    const chunkStart = i + 1; // ← provenance: from this file's own offset
    const chunkEnd = Math.min(i + CHUNK_SIZE, originalLines);
    const chunkPrompt =
      `File: ${fileName} (${originalLines} lines total)\n` +
      `Chunk: lines ${chunkStart}-${chunkEnd}\n` +
      `Top-level context:\n${imports}\n\n` +
      chunkLines.join('\n') +
      `\n\n---\nExtract up to 12 findings for THIS chunk, each with a [Lxx] ref.\n` +
      `Return JSON: {"summary":"<1-2 sentences for THIS chunk>","key_findings":["..."]}`;
    const result = await vendor.complete(systemPrompt, chunkPrompt);
    chunkResults.push({ start: chunkStart, end: chunkEnd, ...normalizeChunk(result) });
    if (i + CHUNK_SIZE >= lines.length) break;
  }

  // Stitch + dedup by leading identifier (catches overlap-zone dupes).
  const seen = new Set();
  const findings = chunkResults
    .flatMap((r) => (r.key_findings || []).map((f) => `[L${r.start}-${r.end}] ${f}`))
    .filter((f) => {
      const body = f.replace(/^\[L\d+-\d+\]\s*/, '');
      const id = (body.match(/^([A-Za-z_$][A-Za-z0-9_$]*)/)?.[1] || body.slice(0, 40)).toLowerCase();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, MAX_FINDINGS);

  return {
    summary: chunkResults.map((r) => r.summary || '').filter(Boolean).join(' '),
    key_findings: findings,
    relevant_sections: chunkResults.map((r) => r.relevant_sections || '').filter(Boolean).join(' | '),
    original_lines: originalLines,
  };
}

function normalize(result, originalLines) {
  return {
    summary: result?.summary || '',
    key_findings: Array.isArray(result?.key_findings) ? result.key_findings : [],
    relevant_sections: result?.relevant_sections || '',
    original_lines: originalLines,
  };
}

function normalizeChunk(result) {
  return {
    summary: result?.summary || '',
    key_findings: Array.isArray(result?.key_findings) ? result.key_findings : [],
    relevant_sections: result?.relevant_sections || '',
  };
}

module.exports = { buildIndex, CHUNK_SIZE, OVERLAP, MAX_FINDINGS, getFindingsTarget };
