'use strict';
/**
 * @herald/adapter-openai — optional compression driver (stub).
 *
 * Proves the agnosticism claim: a second vendor, same interface, zero engine
 * change. Uses the OpenAI Chat Completions HTTP API directly (global fetch) so
 * the stub has no SDK dependency. Wire a real model id via .herald-vendor.json.
 */

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_URL = 'https://api.openai.com/v1';

const SYSTEM_PROMPT =
  'You are a code/text compression expert. Return ONLY a raw JSON object: ' +
  '{"summary":"...","key_findings":["... [Lxx] ..."],"relevant_sections":"..."}.';

function makeComplete(opts = {}) {
  const model = opts.model || DEFAULT_MODEL;
  const baseUrl = (opts.base_url || opts.baseUrl || DEFAULT_URL).replace(/\/$/, '');
  const key = opts.apiKey || process.env[opts.api_key_env || 'OPENAI_API_KEY'];

  return async function ambientComplete(_systemFromCore, userPrompt) {
    if (!key) {
      const e = new Error('openai_no_key');
      e.code = 'ADAPTER_UNAVAILABLE';
      throw e;
    }
    let res;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
    } catch (err) {
      const e = new Error(`openai_unreachable: ${err.message}`);
      e.code = 'ADAPTER_UNAVAILABLE';
      throw e;
    }
    if (!res.ok) {
      const e = new Error(`openai_http_${res.status}`);
      e.code = 'ADAPTER_UNAVAILABLE';
      throw e;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    let obj = null;
    try { obj = JSON.parse(text); } catch { /* tolerant below */ }
    if (!obj) obj = { summary: String(text).slice(0, 200), key_findings: [], relevant_sections: '' };
    return {
      summary: obj.summary || '',
      key_findings: Array.isArray(obj.key_findings) ? obj.key_findings : [],
      relevant_sections: obj.relevant_sections || '',
    };
  };
}

module.exports = { makeComplete, DEFAULT_MODEL, DEFAULT_URL };
