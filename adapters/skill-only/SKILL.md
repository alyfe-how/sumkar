---
name: sumkar
description: Token-efficient file reading. For files over ~50 lines, ask the herald-cli for a compact [Lxx] index first, then read only the line ranges you actually need instead of the whole file. Advisory mode — no hook enforcement on this host.
---

# Sumkar (skill-only / advisory floor)

This is Sumkar's **degradation floor** — for hosts with no "law option" (no PreToolUse
hook, no native-read removal). It is honest about being advisory: it relies on the
model choosing to follow it. That makes it **no stronger than Ponytail/Caveman here** —
but **never weaker**, and it still wins the moment a cache entry exists.

## When you are about to read a large file

1. First run: `node herald-cli.js locate <file_path>` → you get a summary + `[Lxx]`
   key findings instead of the raw dump.
2. To inspect a specific part: read the file with the line range from the relevant
   `[Lxx]` finding (e.g. lines 40–60), not the whole file.
3. If a cached index exists, prefer it. If not, this host can't force compression —
   read normally, but the `locate` call warms the cache for next time.

## Honest limitation

Without a hook, nothing *forces* step 1. Under load you may skip it — which is exactly
why Sumkar's real home is a host with a law option (Claude Code). Here, Sumkar is a
good habit, not a guarantee.
