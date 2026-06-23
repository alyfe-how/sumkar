# The Enforcement Ladder

Herald is an **engine** (`herald-core`) plus a **per-host enforcement adapter**. The
engine is identical everywhere; what changes is the strength of the lock you can put
in front of it. Enforcement comes from exactly one thing: **whether the cheap
alternative (native Read) can be taken away** (thread turns 5-9).

```
            ┌──────────────────────────────┐
            │        herald-core           │   model-agnostic engine.
            │  LOCATE · cache · ROUTE      │   identical on every host.
            └───────────────┬──────────────┘
                            │  + an adapter per host:
        ┌───────────────────┼────────────────────┐
        ▼                   ▼                     ▼
  ┌───────────┐      ┌─────────────┐       ┌──────────────┐
  │ Claude    │      │ MCP host    │       │ skill-only   │
  │ Code hook │      │ (if native  │       │ host         │
  │ exit(2)   │      │  read       │       │ SKILL.md     │
  │           │      │  removable) │       │              │
  │ 🔒 HARD   │      │ 🔓→🔒 if    │       │ 📝 ADVISORY  │
  │ enforced  │      │   rerouted  │       │ (= rivals)   │
  └───────────┘      └─────────────┘       └──────────────┘
   savings           savings if you         savings only
   GUARANTEED        delete native read     if model cooperates
```

| Rung | Host capability | Mechanism | Strength | "Ends well"? |
|------|-----------------|-----------|----------|--------------|
| 1 | PreToolUse Read hook | `exit(2)` block-and-substitute | 🔒 Hard | ✅ Yes |
| 2 | MCP + native-read removable | `herald_read` is the only path | 🔒 Hard | ✅ Yes |
| 2b | MCP, native read stays | button next to native read | 📝 Advisory | ⚠️ Decays |
| 3 | Skill-only | SKILL.md instruction | 📝 Advisory | ⚠️ Decays |

**Key truths:**
- **Capability-gated, not vendor-gated.** Any host that later exposes pre-read
  interception gets rung-1 strength via a new adapter — no engine rewrite.
- **The floor is never below the rivals.** In advisory mode Herald equals
  Ponytail/Caveman (a suggestion) — and beats them the moment a cache hit lands,
  because the engine still works even when enforcement doesn't.
- **Home base = Claude Code today**, because that's where the law (the hook) reliably
  exists.
