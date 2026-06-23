'use strict';
/**
 * @herald/adapter-ollama — free / local compression driver.
 *
 * Zero API cost, zero SDK dependency — talks to a local Ollama server over HTTP
 * (Node 18+ global fetch). Same interface contract as every other adapter, so
 * herald-core can't tell it apart from the Anthropic one. This is the
 * cheap-janitor rung: run a small local model for compression while the host's
 * premium model does the thinking (the two-tier split from thread turn 4).
 */

const DEFAULT_MODEL = 'qwen3-coder:30b';
const DEFAULT_URL = 'http://localhost:11434';

const SYSTEM_PROMPT =
  'You are a code/text compression expert. Return ONLY a raw JSON object: ' +
  '{"summary":"...","key_findings":["... [Lxx] ..."],"relevant_sections":"..."}. ' +
  'No markdown, no fences.';

function makeComplete(opts = {}) {
  const model = opts.model || DEFAULT_MODEL;
  const baseUrl = (opts.base_url || opts.baseUrl || DEFAULT_URL).replace(/\/$/, '');

  return async function ambientComplete(_systemFromCore, userPrompt) {
    let res;
    try {
      res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
    } catch (err) {
      const e = new Error(`ollama_unreachable: ${err.message}`);
      e.code = 'ADAPTER_UNAVAILABLE';
      throw e;
    }
    if (!res.ok) {
      const e = new Error(`ollama_http_${res.status}`);
      e.code = 'ADAPTER_UNAVAILABLE';
      throw e;
    }
    const data = await res.json();
    return parseIndexJson(data?.message?.content || '');
  };
}

function parseIndexJson(text) {
  const raw = String(text || '').trim();
  let obj = null;
  try { obj = JSON.parse(raw); } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { obj = JSON.parse(m[0]); } catch { /* fall through */ } }
  }
  if (!obj) obj = { summary: raw.slice(0, 200), key_findings: [], relevant_sections: '' };
  return {
    summary: obj.summary || '',
    key_findings: Array.isArray(obj.key_findings) ? obj.key_findings : [],
    relevant_sections: obj.relevant_sections || '',
  };
}

module.exports = { makeComplete, parseIndexJson, DEFAULT_MODEL, DEFAULT_URL };
