<p align="center">
  <img src="Source/logo/sumkar-lockup-esmc-light-500.png" alt="Sumkar" width="240">
</p>

<p align="center">
  <b>Your AI re-reads the same files over and over. Sumkar makes it read them once.</b><br>
  <i>A context-virtualization engine: compress a file to a navigable index once, then serve that index on every read — across sessions.</i><br>
  <sub>Powered by <b>Herald</b>, the context engine from ESMC.</sub>
</p>

<p align="center">
  <a href="#the-number"><b>~40% fewer file tokens per read</b></a> ·
  <a href="benchmarks/RESULTS.md"><b>Measured, reproducible</b></a> ·
  <a href="#install"><b>2-minute install</b></a> ·
  MIT
</p>

---

## Most token tools are first-turn tools. Sumkar isn't.

Most tools that save AI tokens optimize the **moment of creation** — write less code, say
fewer words. Their savings *decay* as a session grows, because they have no memory of what
was already read. Your agent reads `big_file.js` on turn 3, again on turn 9, again on turn
20 — paying full price every time.

**Sumkar is different by design.** It doesn't just start well — it ends well, because it's
built with a brain (the **Herald** engine): a cache + a navigable `[Lxx]` index that
**remembers what it already compressed**. Build the index once; every read after — even in
a brand-new session tomorrow — is cheap. The savings **compound** instead of decaying.

> Herald is one of several pillars of **ESMC**, an AI orchestration system. Sumkar is the
> pillar we packaged to stand on its own. ESMC is Sumkar's pedigree, **not its dependency** —
> the engine here runs entirely standalone.

---

## The number — and exactly how it was measured

The method *is* the proof. We took one public file — Express.js
[`response.js`](https://github.com/expressjs/express/blob/master/lib/response.js)
(**1,051 lines, MIT**) — and **read it 5 times, with `/clear` between each read** so every
read is genuinely fresh (the model can't "remember" it and skip). Two identical folders,
same model (Haiku), same prompt — one **with** Sumkar, one **without**. Then we summed the
file-ingestion tokens from each session's own transcript. No screenshots to trust — a
protocol anyone can replay:

*(The index in this benchmark was built by **local Ollama running `qwen3-coder:30b`**;
results may vary slightly by compression backend — see [benchmarks/RESULTS.md](benchmarks/RESULTS.md).)*

| Read (─ `/clear` between each ─) | **Without Sumkar** | **With Sumkar** | |
|---|---:|---:|---|
| Read 1 | 25,157 (raw file) | 15,028 *(builds index, cold)* | |
| Read 2 | 25,156 (raw **again**) | 15,043 *(index from disk)* | |
| Read 3 | 25,158 (raw **again**) | 15,034 *(index from disk)* | |
| Read 4 | 24,934 (raw **again**) | 15,039 *(index from disk)* | |
| Read 5 | 25,151 (raw **again**) | 14,824 *(index from disk)* | |
| **5-read total** | **125,556** | **74,968** | **40.3% less** |

The control **re-pays the full file every read**. Sumkar builds the index **once** (read 1,
cold) and serves it from disk the other four times — *even though context was cleared between
each.* That's the whole thesis, visible in the curve: control climbs linearly, Sumkar flat.

**The index persists to disk and is reused across sessions.** Once built, the `[Lxx]`
index is cached to `.herald/cache/` and `mtime`-validated, so a later session loads it from
disk instead of rebuilding — the build cost (read 1) is paid once, not once per session.
(The per-read token saving above is fully measured; per-session token measurement of the
cross-session case is in progress.) Full protocol table, per-bucket breakdown, and the
honest caveats (why raw-total moves only 10%, why read 1 is the build):
**[benchmarks/RESULTS.md](benchmarks/RESULTS.md).**

---

## How it works

```
                 you (or your agent) reads a big file
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Herald hook           │   intercepts the read
                    └───────────┬───────────┘
                    cache hit?  │
              ┌─────────────────┴─────────────────┐
              ▼ no (first time)                    ▼ yes (every time after)
   compress → navigable [Lxx] index        serve the index from disk
   (once, ~1 min, cheap model)             (instant — no model call)
              │                                    │
              └─────────────────┬─────────────────┘
                                ▼
        the model gets a small index, not the raw file
        → ~40% fewer tokens, on every read, across sessions
```

1. **LOCATE** — compress a large file into a navigable `[Lxx]` index (summary + key findings
   with line refs). Cached to disk, `mtime`-validated.
2. **OPERATE** — to inspect a specific part, read the exact `{offset, limit}` line range from
   the relevant `[Lxx]` finding. You read only the lines you need, undiluted.

The index is built by a **separate, cheap model** (local Ollama by default, or any model you
configure) — so your premium session model never has to read the bulk. That's the two-tier
design: cheap model files, premium model thinks.

---

## Why it's a category of one

|  | Caveman | Ponytail | **Sumkar** |
|---|---|---|---|
| Lever | output words | generated code | **context substrate** (re-reads) |
| Stateful | ❌ | ❌ | ✅ disk-persisted index |
| Enforced | advisory | advisory | ✅ on Claude Code (hook) |
| Model-agnostic | n/a | n/a | ✅ any model builds the index |
| Savings over a session | decay | flat | **compound** |

Other tools steer the *words* or the *code*. **Sumkar steers the context substrate both sit
on top of** — and it's the only one with a real engine under the skill.

---

## Install

> Works today on **Claude Code** (the hook gives hard enforcement). Other agents get an
> advisory mode — see [docs/ENFORCEMENT-LADDER.md](docs/ENFORCEMENT-LADDER.md).

**Windows (PowerShell):**
```powershell
.\install.ps1 C:\path\to\your-project
```

**macOS / Linux:**
```bash
./install.sh /path/to/your-project
```

That copies the engine into `your-project/.herald/` (Sumkar's engine cache) and wires the
read-hook into `your-project/.claude/settings.json`. Full walkthrough: **[GETTING-STARTED.md](GETTING-STARTED.md).**

### Compression backend (for building the index)

Sumkar builds the index with a **separate model** — never your subscription's chat model.
Pick one (it's the *only* setup step):

- **Free + local (recommended):** [Ollama](https://ollama.com) with a code model
  (`ollama pull qwen3-coder:30b`). Copy `.herald-vendor.json.example` → `.herald-vendor.json`,
  set `"vendor": "ollama"`. Zero API cost.
- **Hosted:** set `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) and point the config at it.

No backend? Sumkar still runs — it just reads large files raw on the *first* touch, then
indexes them for every read after. It never breaks.

---

## First use

```
cd your-project
claude            # or open the folder in Cursor / any Claude Code host
```

Ask it to read a large file. Instead of dumping the whole thing, Sumkar hands the model a
navigable `[Lxx]` index — and your context bar stays small. That's it.

---

## Status

- ✅ `herald-core` engine — zero runtime deps, 11/11 tests (`npm test`)
- ✅ Claude Code hook adapter — hard enforcement (verified)
- ✅ Benchmark — 40% per read + cross-session persistence, **measured & reproducible**
- ✅ Adapters: Anthropic (default), Ollama (free/local), OpenAI, skill-only fallback

---

## The bigger picture — ESMC & Alyfe

Inside Sumkar is **Herald** — one pillar of **ESMC**, an AI orchestration system built around
a closed memory loop: retrieval, judgment (Athena), execution (Echelon), and persistent
memory (Aegis, Atlas/Hydra). **Alyfe** is ESMC's autonomous agent mode. Herald is the pillar
that virtualizes the context window so the rest of that brain spends its tokens on signal,
not bulk — and Sumkar is that pillar, packaged to stand on its own.

You don't need any of that to use Sumkar — it stands alone. But if Sumkar earns its place in
your workflow and you wonder what kind of system thinks like this, that's where it came from.

---

## License

MIT. See [LICENSE](LICENSE). The benchmark uses a public MIT file (Express `response.js`);
no private code ships in this repo.
