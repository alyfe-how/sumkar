#!/usr/bin/env node
'use strict';
/**
 * Herald-Portable — MCP adapter (MEDIUM enforcement rung).
 *
 * THE CATCH (thread turn 8): an MCP tool is "a button the model CAN press" — by
 * itself it's only as strong as a skill, because native Read sits right next to it.
 * MCP becomes ENFORCEMENT only if the host can remove/route-away the native read
 * path. So this adapter ships two things:
 *   1. herald_read   — the wrapped read (compress → index → surgical range)
 *   2. ENFORCEMENT.md — how to disable native Read on each MCP host so herald_read
 *                       is the ONLY path (that's what turns the button into a law).
 *
 * This is a minimal stdio JSON-RPC stub (no SDK dependency) so it stays portable.
 * For production, swap the transport for @modelcontextprotocol/sdk; the tool logic
 * (herald-core calls) is unchanged.
 */

const path = require('path');
let herald;
try { herald = require('../../packages/herald-core/src/index.js'); }
catch { herald = require('@herald/core'); }

const CACHE_DIR = path.join(process.cwd(), '.herald', 'cache');

const TOOLS = [
  {
    name: 'herald_read',
    description:
      'Read a file via Herald: returns a navigable [Lxx] index for large files, ' +
      'or surgical line-ranges when a task/problem is supplied. Use INSTEAD of native read.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        problem: { type: 'string', description: 'optional: what you are looking for — returns surgical ranges' },
      },
      required: ['file_path'],
    },
  },
];

async function handleToolCall(name, args) {
  if (name !== 'herald_read') throw new Error(`unknown tool: ${name}`);
  const opts = {
    cacheDir: CACHE_DIR,
    // Host wires its model here for compression-on-miss; ambient otherwise.
    ambientComplete: globalThis.__heraldAmbientComplete || null,
  };
  const loc = await herald.locate(args.file_path, opts);
  if (args.problem && (loc.status === 'cache_hit' || loc.status === 'compressed')) {
    const routed = herald.route(args.file_path, args.problem, opts);
    return { locate: loc, route: routed };
  }
  return { locate: loc };
}

// ── Minimal stdio JSON-RPC loop (newline-delimited) ───────────────────────────
let buf = '';
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line) dispatch(line);
  }
});

async function dispatch(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const reply = (result, error) =>
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, ...(error ? { error } : { result }) }) + '\n');
  try {
    if (msg.method === 'tools/list') return reply({ tools: TOOLS });
    if (msg.method === 'tools/call') {
      const out = await handleToolCall(msg.params?.name, msg.params?.arguments || {});
      return reply({ content: [{ type: 'text', text: JSON.stringify(out) }] });
    }
    reply(null, { code: -32601, message: 'method not found' });
  } catch (e) {
    reply(null, { code: -32000, message: e.message });
  }
}

module.exports = { handleToolCall, TOOLS };
