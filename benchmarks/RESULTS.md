# Sumkar — Benchmark Results
<sub>(engine: Herald, from ESMC)</sub>

> **Read this first.** This is the document a skeptic reads before they trust the headline.
> Everything here is measured, the mechanism is stated up front, and the honest caveats
> are above the numbers — not buried under them.

## TL;DR

- **~40% fewer file-ingestion tokens per read** on a large file, same model, same prompt.
- The index is **built once** (cold, ~1 min on a local model), **persisted to disk**, and
  **served on every subsequent read — including in brand-new, genuinely cold sessions** —
  until the source file changes.
- Both halves are measured: the 40% from a 5-read marathon; the "persists across sessions"
  from a disk-toggle test (index present vs deleted).

## The mechanism (so the numbers make sense)

Sumkar compresses a large file into a small navigable `[Lxx]` index **once**, writes that
index to `.herald/cache/<md5-of-path>.json`, and on every later read serves the index
instead of the raw file. The index is `mtime`-validated: if the source file changes, Sumkar
rebuilds; otherwise it reuses the on-disk index forever. **The savings come from the model
ingesting a ~15k-token index instead of a ~25k-token raw file — every read.**

---

## Test setup

| | |
|---|---|
| **Benchmark file** | Express.js [`lib/response.js`](https://github.com/expressjs/express/blob/master/lib/response.js) — **1,051 lines, MIT licensed, public** |
| **Session model** | Claude Haiku 4.5 (same on both sides) |
| **Compression backend** | Local Ollama (`qwen3-coder:30b`) — free, runs on the user's machine |
| **Prompt** | `read response.js fully and tell me the exact line count and what it does` |
| **Control** | No Sumkar — model reads the raw 1,051-line file |
| **Treatment** | Sumkar installed (Herald hook active) — model reads the index |
| **Measurement** | `~/.claude/projects/**/*.jsonl` transcript token buckets (the model's own ledger) |

Why this file: a complete, famous, permissively-licensed source file at a size that
compresses fast (~1 min cold) and that any reader can reproduce. No private code involved.

---

## The protocol — exactly how it was run (this is the part that matters)

> Forget screenshots. The credibility is the **method**: same file, same model, same prompt,
> read **5 times** with `/clear` between each read so every read is genuinely fresh (no "I
> already read it"). Two folders, identical except one has Sumkar installed. Anyone can
> replay this line-for-line.

| Step | **Control** — `non-sumkar/` (no Sumkar) | **Treatment** — `sumkar/` (Sumkar installed) |
|---|---|---|
| Setup | folder with `response.js` (1,051 lines), **no** hook | identical folder + Sumkar hook + Ollama backend, **cold cache** |
| Model | `/model` → Haiku 4.5 | `/model` → Haiku 4.5 (same) |
| Read 1 | read the file → model ingests **raw 1,051 lines** | read the file → Sumkar **builds the index once** (cold), model ingests the **index** |
| `/clear` | wipe context | wipe context (the **on-disk index survives** — it's a file) |
| Read 2 | read again → ingests **raw file again** (full price) | read again → served the **index from disk** (no rebuild) |
| `/clear` → Read 3 | raw file, full price | index from disk |
| `/clear` → Read 4 | raw file, full price | index from disk |
| `/clear` → Read 5 | raw file, full price | index from disk |
| Measure | sum the `cache_creation` token bucket across all 5 transcripts | same — sum across all 5 transcripts |

**Why `/clear` between reads is the honest move:** it resets the *model's* memory so each
read is a real, fresh read (the baseline can't "remember" the file and skip it). It does
**not** touch the transcript on disk (where tokens are counted) **nor** Sumkar's index file
(`.herald/cache/`). So the control re-pays full price 5×; Sumkar pays the build **once** and
serves the index from disk the other 4× — across context resets. That's the marathon.

---

## Result 1 — The 5-read marathon (cold)

The numbers below are the direct output of running the protocol above. **Treatment ran
cold** — the index was built on read 1, so the build cost is *inside* Sumkar's column, not
hidden by a pre-warm.

### File-ingestion tokens (`cache_creation` bucket = the file content entering context)

| Read | Control (no Sumkar) | Sumkar | Saved |
|------|--------------------:|-------:|------:|
| 1 | 25,157 | 15,028 *(incl. cold build)* | 40% |
| 2 | 25,156 | 15,043 | 40% |
| 3 | 25,158 | 15,034 | 40% |
| 4 | 24,934 | 15,039 | 40% |
| 5 | 25,151 | 14,824 | 41% |
| **Sum** | **125,556** | **74,968** | **40.3%** |

### Session totals

| Metric | Control | Sumkar | Saved |
|--------|--------:|-------:|------:|
| File-ingestion (the file content) | 125,556 | 74,968 | **40.3%** |
| Cache-weighted total¹ | 163,742 | 112,987 | **31.0%** |
| Raw total | 487,890 | 437,176 | 10.4% |

¹ Cache-weighted counts cache-reads at the discounted ~0.1× rate (Anthropic's cache-read
pricing), which is the honest "effective cost" framing.

### Honest fine print (read this before quoting a number)

- **Read 1 carries the cold build cost** (15,028 — the top of Sumkar's range). Reads 2–5
  do **not** rebuild — they're served from the on-disk index. So this is *one cold build +
  four cache hits*, **not** five independent builds. The tight 40/40/40/40/41% clustering is
  exactly what you'd expect from that, and we state it plainly so the flat curve doesn't
  look suspicious.
- **Why raw-total only moves 10.4%:** each read also carries ~72k tokens of Claude Code's
  own fixed system/tools overhead (the `cache_read` bucket), identical on both sides and
  **uncompressible by Sumkar**. That fixed cost dilutes the raw-total percentage. The honest
  figure to quote is **file-ingestion (40%)** — the part Sumkar actually controls — or the
  cache-weighted total (31%).
- **`/clear` resets the model's context, not the disk.** Both sides were cleared
  identically, so the A/B is clean. This measures "repeated cold reads of the same file,"
  which is Sumkar's exact use case.

---

## Result 2 — Disk persistence ("build once, serve forever"), proven by toggle

The savings % alone **cannot** prove persistence — a tool that rebuilds the index every
session would *also* show ~40%. The discriminating signal is the **build cost on first
touch**, tested in both directions against the engine directly (fresh processes, no warm
prompt cache to contaminate the result):

| Direction | Index on disk? | Cold first read | Build cost? | Meaning |
|-----------|:--------------:|----------------:|:-----------:|---------|
| **A** | ✅ present | **`cache_hit` in 1 ms** | none | index **loaded from disk** |
| **B** | ❌ deleted | **`compressed` in 56.8 s** | full Ollama rebuild | index **had to be rebuilt** |

**1 ms vs 56,800 ms = a 56,800× contrast.** This is only explainable by disk persistence:
index present → cheap (loaded); index deleted → expensive (rebuilt). Deleting the on-disk
index makes the first read expensive again — which proves the savings were coming from the
persisted index, not from any ephemeral cache.

**Verdict:** the index is a real file (`.herald/cache/<md5>.json`), `mtime`-validated,
reused by any future cold session until the source file changes. "Build once, serve forever
across sessions" is **earned**, not asserted.

---

## What this does and does not claim

| Claim | Status |
|---|---|
| ~40% fewer file-ingestion tokens per read | ✅ Measured (marathon) |
| Index builds once cold, serves cheap thereafter | ✅ Measured (read 1 vs reads 2–5) |
| Index persists to disk across cold sessions | ✅ Measured (toggle: 1 ms vs 56.8 s) |
| Rebuilds only when the source file changes | ✅ `mtime`-validated in code (`src/cache.js`) |
| Beats a *frontier* model that already self-limits on huge files | ❌ Not claimed — a smart model (e.g. Opus) often greps/offset-reads big files itself; Sumkar's win is largest on cheaper models and on every guaranteed re-read |

That last row is the honest boundary: Sumkar's value is **enforced, model-agnostic, and
compounding** — guaranteed on every read and every model, including the cheap ones that
*do* gulp whole files. It is not "magic on a frontier model's single cold read."

---

## Reproduce it yourself

1. Install Sumkar into a folder (see [`../GETTING-STARTED.md`](../GETTING-STARTED.md)).
2. Drop any public 800–1500 line source file in (we used Express `response.js`).
3. Point `.herald-vendor.json` at a backend (free local Ollama, or an API key).
4. Read the file in two folders — one with Sumkar, one without — and compare the
   `cache_creation` token bucket in `~/.claude/projects/**/*.jsonl`.
5. For the persistence test: delete `.herald/cache/*.json` and time a cold read (slow,
   rebuilds) vs leaving it intact (instant, loads). The contrast is the proof.

No private code, no API keys in the repo, fully reproducible.
