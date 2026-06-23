---
name: sumkar
description: Context virtualization. Before reading large files, route through Sumkar's [Lxx] index and re-read only the lines a task needs. Enforced by the herald-gate hook on Claude Code; advisory elsewhere.
---

# Sumkar (Claude Code)

Sumkar is an **engine wearing a skill as a doorway.** Inside it is the **Herald** engine;
on Claude Code the real work is done by the `herald-gate` PreToolUse hook (hard
enforcement) — this SKILL.md just documents intent and the surgical-read workflow for the model.

## The loop

1. **LOCATE** — when you hit a file > 50 lines, the hook intercepts the raw Read and
   hands you a navigable `[Lxx]` index (summary + key findings with line refs).
2. **OPERATE** — to edit/inspect a specific part, Read again with `offset` + `limit`
   on the `[Lxx]` range you need. The hook ALLOWS surgical reads on a warm cache, so
   the precise region arrives undiluted.

## Why the hook (not just this skill)

Reading a file is the model's strongest reflex. "Compress first, then read the index"
is a *step* that cuts against that reflex and gets dropped under load. The hook removes
the choice — that's why Sumkar's savings hold deep into a session ("ends well"), where
a pure instruction would decay. Without a hook (other hosts), Sumkar falls back to
advisory mode — never worse than a plain skill, better the moment a cache hit lands.
