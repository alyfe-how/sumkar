# MCP enforcement — turning the button into a law

An MCP tool is, by default, **just a button the model may choose to press.** Native
`Read` sits right next to `herald_read`, so the model can ignore Herald. To make MCP
*enforce* (not merely offer), you must **remove the cheap alternative**. Per host:

| Host | Can native read be removed/routed? | Resulting Herald strength |
|------|-----------------------------------|---------------------------|
| Generic MCP client w/ tool allowlist | ✅ Disable built-in file read; expose only `herald_read` | **Hard** — only path is Herald |
| Hosts that proxy ALL file access through MCP | ✅ Route native read → `herald_read` | **Hard** |
| Hosts that keep native read always-on | ❌ Cannot remove it | **Advisory** — equals a skill |

**Rule of thumb:** MCP only reaches hook-level enforcement when you can answer "yes"
to *"can I delete or reroute native Read on this host?"* If no, ship the skill-only
adapter instead and set expectations to advisory.

This stub uses a minimal stdio JSON-RPC transport (zero SDK dependency). For
production wire `@modelcontextprotocol/sdk`; the `herald_read` logic (herald-core
calls) is unchanged.
