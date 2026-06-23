# Getting Started with Sumkar

From zero to "my AI reads files 40% cheaper" in about 2 minutes.
<sub>Sumkar is powered by the Herald engine (from ESMC). You'll see `.herald/` and
`herald-gate` in paths — that's the engine inside; the product you installed is Sumkar.</sub>

---

## What you need

- **Node.js 18+** (Sumkar's engine and the `herald-gate` hook run on it).
- **A Claude Code host** — the `claude` CLI, or Cursor, or any editor that runs Claude Code
  hooks. (Sumkar's hard enforcement is a Claude Code feature; other hosts get advisory mode.)
- **A compression backend** for building the index — pick one in Step 3 below.

---

## Step 1 — Install Sumkar into your project

Sumkar installs *into a project folder*. It copies its engine to `your-project/.herald/` and
wires a read-hook into `your-project/.claude/settings.json`.

**Windows (PowerShell):**
```powershell
# from the Sumkar folder
.\install.ps1 C:\path\to\your-project
```

**macOS / Linux:**
```bash
# from the Sumkar folder
./install.sh /path/to/your-project
```

You should see:
```
  copied engine + adapters -> .herald/
  wired Read hook -> .claude/settings.json
```

That's the whole install. The hook now fires before every file read in that project.

---

## Step 2 — Confirm it's wired

Open `your-project/.claude/settings.json`. It should contain a `PreToolUse` → `Read` hook
pointing at `.herald/adapters/claude-code/herald-gate.js`. If you had existing settings, the
installer merged the hook in without touching the rest.

---

## Step 3 — Choose the compression backend (the one real setup step)

Sumkar builds the index with a **separate model** — *not* your subscription's chat model
(your Claude Max / Pro login can't be used by the index builder; it needs its own backend).
This keeps Sumkar model-agnostic. Pick one:

### Option A — Free + local (recommended)

1. Install [Ollama](https://ollama.com).
2. Pull a code model: `ollama pull qwen3-coder:30b` (or any code model you like).
3. In your project, copy the example config:
   ```bash
   cp .herald-vendor.json.example .herald-vendor.json
   ```
4. Make sure it says:
   ```json
   { "compress": { "vendor": "ollama", "model": "qwen3-coder:30b", "base_url": "http://localhost:11434" } }
   ```

Zero API cost. The index is built on your own machine.

### Option B — Hosted (Anthropic / OpenAI)

1. Set the key in your environment: `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`).
2. `.herald-vendor.json`:
   ```json
   { "compress": { "vendor": "anthropic", "model": "claude-haiku-4-5", "api_key_env": "ANTHROPIC_API_KEY" } }
   ```
   (Haiku is the cheap-builder sweet spot. Costs a few cents per large file, once.)

### No backend at all?

Sumkar still works — it just reads large files **raw on the first touch**, then indexes them
for every read after. It never errors. (The first cold read is the only time it can't help.)

---

## Step 4 — First use

```bash
cd your-project
claude          # or open the project in Cursor
```

Ask it to read a large file:

```
read src/big-file.js and tell me what it does
```

**What you'll see:** instead of dumping the whole file into context, Sumkar hands the model a
navigable `[Lxx]` index (a summary + key findings with line numbers). Your `/context` bar
stays small. To dig into a specific part, the model reads just that line range.

> **First read of a brand-new large file pauses while the index builds** (a few seconds to
> ~1 min, depending on file size and backend). That's the one-time cost. Every read after —
> including in a fresh session tomorrow — is instant, served from `.herald/cache/`.

---

## Swapping the compression model later

Edit `.herald-vendor.json` — no reinstall, no engine change:

```jsonc
// free local
{ "compress": { "vendor": "ollama",    "model": "qwen3-coder:30b", "base_url": "http://localhost:11434" } }
// cheap hosted (two-tier: cheap builder, premium session)
{ "compress": { "vendor": "anthropic", "model": "claude-haiku-4-5", "api_key_env": "ANTHROPIC_API_KEY" } }
// openai
{ "compress": { "vendor": "openai",    "model": "gpt-4o-mini",      "api_key_env": "OPENAI_API_KEY" } }
```

The engine only ever sees a function — it never imports a vendor SDK — so swapping is a
config edit, and Sumkar stays model-agnostic.

---

## Verify the engine (optional)

From the Sumkar folder:
```bash
npm test
```
Runs the engine smoke tests (full LOCATE → cache → ROUTE loop) and the vendor-ladder tests.
Expect `6/6` + `5/5` green.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| First read of a big file "hangs" ~30–60s | That's the cold index build. Let it finish; subsequent reads are instant. |
| Large file read raw, no index | No backend configured, or backend unreachable. Check `.herald-vendor.json` and that Ollama/your key is available. |
| Hook didn't fire | File ≤ 50 lines (below Sumkar's threshold), or a binary/dotfile (exempt). Only larger text files are indexed. |
| Want to force a rebuild | Edit the source file (mtime changes → Sumkar rebuilds), or delete its entry in `.herald/cache/`. |

---

## Uninstall

Delete `your-project/.herald/` and remove the `PreToolUse` → `Read` Sumkar hook from
`your-project/.claude/settings.json`. Nothing else is touched.
