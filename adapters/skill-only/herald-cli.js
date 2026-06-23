#!/usr/bin/env node
'use strict';
/**
 * Herald-Portable — skill-only CLI. The model calls this manually (advisory mode).
 *   node herald-cli.js locate <file>            → compress (if backend) + show index
 *   node herald-cli.js route  <file> "<problem>" → surgical {offset,limit} ranges
 *   node herald-cli.js stats                     → cache savings
 */

const path = require('path');
let herald;
try { herald = require('../../packages/herald-core/src/index.js'); }
catch { herald = require('@herald/core'); }

const CACHE_DIR = path.join(process.cwd(), '.herald', 'cache');
const opts = { cacheDir: CACHE_DIR };
const [cmd, a, b] = process.argv.slice(2);

(async () => {
  if (cmd === 'locate') {
    console.log(JSON.stringify(await herald.locate(a, opts), null, 2));
  } else if (cmd === 'route') {
    console.log(JSON.stringify(herald.route(a, b || '', opts), null, 2));
  } else if (cmd === 'stats') {
    console.log(JSON.stringify(herald.stats(opts), null, 2));
  } else {
    console.log('usage: herald-cli.js <locate|route|stats> ...');
    process.exit(1);
  }
})();
