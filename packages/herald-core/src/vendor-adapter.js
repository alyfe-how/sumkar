'use strict';
/**
 * herald-core/vendor-adapter — model-agnostic compression backend selector.
 *
 * THE 4-RUNG GRACEFUL-DEGRADE LADDER (thread turns 4-6). herald-core never
 * imports a model SDK — it resolves a `complete()` fn through adapters that live
 * OUTSIDE the engine. Selection is config-driven (.herald-vendor.json), exactly
 * like ESMC's .esmc-vendor-config.json. Each rung degrades, never hard-exits:
 *
 *   1. .herald-vendor.json names a vendor → load that adapter (user's choice)
 *   2. else the DEFAULT adapter (Anthropic / claude-sonnet-4-6) if resolvable
 *   3. else ambientComplete passed in by the host (the host's own model)
 *   4. else null → caller reads the file raw (the :752 fix; never hard-exits)
 *
 * The engine receives only a function. It has no idea which model ran — that is
 * what keeps Herald LLM-agnostic while still shipping a default.
 */

const fs = require('fs');
const path = require('path');

// Adapter registry: vendor name → require path (resolved lazily, outside the engine).
// Monorepo-relative first, then published-package names. Missing adapter → skip rung.
const ADAPTER_PATHS = {
  anthropic: ['../../../adapters/anthropic', '@herald/adapter-anthropic'],
  ollama: ['../../../adapters/ollama', '@herald/adapter-ollama'],
  openai: ['../../../adapters/openai', '@herald/adapter-openai'],
};

const DEFAULT_VENDOR = 'anthropic'; // Sonnet 4.6 default

function loadAdapter(vendor) {
  const candidates = ADAPTER_PATHS[vendor];
  if (!candidates) return null;
  for (const c of candidates) {
    try {
      const mod = c.startsWith('.') ? require(path.join(__dirname, c)) : require(c);
      if (mod && typeof mod.makeComplete === 'function') return mod;
    } catch { /* try next candidate */ }
  }
  return null;
}

function readVendorConfig(opts) {
  const configPath =
    opts.vendorConfigPath || path.join(process.cwd(), '.herald-vendor.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    const vc = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return vc.compress || vc; // accept {compress:{...}} or a bare {...}
  } catch {
    return null; // malformed → treat as absent (degrade, never fail)
  }
}

/**
 * resolveVendor(opts) → { mode, vendor, model, complete }
 * complete may be null → host should read raw (rung 4).
 *
 * opts.ambientComplete : host's own model fn (rung 3)
 * opts.vendorConfigPath: override .herald-vendor.json path
 */
function resolveVendor(opts = {}) {
  // ── Rung 1: explicit config ────────────────────────────────────────────────
  const cfg = readVendorConfig(opts);
  if (cfg && cfg.vendor) {
    const adapter = loadAdapter(cfg.vendor);
    if (adapter) {
      return {
        mode: 'configured',
        vendor: cfg.vendor,
        model: cfg.model || null,
        complete: adapter.makeComplete({
          model: cfg.model,
          apiKey: cfg.api_key ? cfg.api_key : undefined,
          api_key_env: cfg.api_key_env,
          base_url: cfg.base_url,
          maxTokens: cfg.max_tokens,
        }),
      };
    }
    // named vendor not installed → fall through to default
  }

  // ── Rung 2: default adapter (Anthropic / Sonnet 4.6) ───────────────────────
  const def = loadAdapter(DEFAULT_VENDOR);
  if (def) {
    return {
      mode: 'default',
      vendor: DEFAULT_VENDOR,
      model: (cfg && cfg.model) || (def.DEFAULT_MODEL || 'claude-sonnet-4-6'),
      complete: def.makeComplete({ model: cfg && cfg.model }),
    };
  }

  // ── Rung 3: ambient (host's own model) ─────────────────────────────────────
  if (opts.ambientComplete) {
    return { mode: 'ambient', vendor: 'host', model: 'ambient', complete: opts.ambientComplete };
  }

  // ── Rung 4: no backend → caller reads raw (never hard-exit) ────────────────
  return { mode: 'none', vendor: null, model: null, complete: null };
}

module.exports = { resolveVendor, loadAdapter, readVendorConfig, DEFAULT_VENDOR };
