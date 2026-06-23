'use strict';
/**
 * @herald/adapter-anthropic — the DEFAULT compression driver.
 *
 * This is the ONLY file in Herald-Portable that imports the Anthropic SDK.
 * herald-core never imports it — the engine receives `complete()` through the
 * ambientComplete interface and stays model-agnostic (see thread turns 5-6).
 * Swap this for adapters/openai, adapters/ollama, etc. via .herald-vendor.json
 * and the engine doesn't change a line.
 *
 * Default model: claude-sonnet-4-6 ($3/$15 per MTok) — "not expensive, not too
 * cheap, fully capable", the right tier for compression/summarization.
 */

const DEFAULT_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT =
  'You are a code/text compression expert for context virtualization. Analyze the ' +
  'content and return ONLY a raw JSON object — no explanation, no markdown, no code ' +
  'fences — just the JSON.';

/**
 * makeComplete(opts) → ambientComplete(systemPrompt, userPrompt) → {summary, key_findings, relevant_sections}
 *
 * opts.model        : override model id (default claude-sonnet-4-6)
 * opts.apiKey       : explicit key (else SDK reads ANTHROPIC_API_KEY / ant profile)
 * opts.maxTokens    : cap on the index size (default 1500 — an index is small)
 *
 * Lazy-requires the SDK so a project that never uses this adapter pays nothing
 * and herald-core can be installed without @anthropic-ai/sdk present.
 */
function makeComplete(opts = {}) {
  const model = opts.model || DEFAULT_MODEL;
  let client = null;

  return async function ambientComplete(_systemFromCore, userPrompt) {
    if (!client) {
      let Anthropic;
      try {
        Anthropic = require('@anthropic-ai/sdk');
      } catch {
        const e = new Error('anthropic_sdk_missing: run `npm i @anthropic-ai/sdk`');
        e.code = 'ADAPTER_UNAVAILABLE';
        throw e;
      }
      client = new (Anthropic.default || Anthropic)(
        opts.apiKey ? { apiKey: opts.apiKey } : {}
      );
    }

    // Sonnet 4.6: no budget_tokens, no temperature; structured-output JSON via prompt.
    // max_tokens kept modest — the [Lxx] index is small by design.
    const resp = await client.messages.create({
      model,
      max_tokens: opts.maxTokens || 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = (resp.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return parseIndexJson(text);
  };
}

/** Tolerant JSON extraction — strips fences/prose if the model added any. */
function parseIndexJson(text) {
  const raw = String(text || '').trim();
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  let obj = tryParse(raw);
  if (!obj) {
    const m = raw.match(/\{[\s\S]*\}/); // first {...} block
    if (m) obj = tryParse(m[0]);
  }
  if (!obj) obj = { summary: raw.slice(0, 200), key_findings: [], relevant_sections: '' };
  return {
    summary: obj.summary || '',
    key_findings: Array.isArray(obj.key_findings) ? obj.key_findings : [],
    relevant_sections: obj.relevant_sections || '',
  };
}

module.exports = { makeComplete, parseIndexJson, DEFAULT_MODEL };
