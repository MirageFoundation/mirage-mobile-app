---
description: "Start the Mirage node MCP server in a persistent terminal, reusing a healthy instance if one is already running."
agent: "build"
includeInHistory: false
oneShot: false
---

Start the Mirage node MCP server so its tools are callable in this session.

The server is a Streamable HTTP MCP server defined in `tools/mcp/` and registered
in `.otto/config.json` as `mirage` → `http://127.0.0.1:8787/mcp`. Unlike a stdio
server, otto does not launch it: it must already be running before the tools
connect. That is what this recipe does.

Do not report progress commentary. Work through the steps and give the short
final summary described at the end.

## Steps

1. Check whether an instance is already serving:

   `curl -s -m 2 http://127.0.0.1:8787/health`

   A healthy instance returns `{"ok":true,"node":"...","endpoint":"/mcp"}`.
   If it does, skip to step 4 — never start a second one, the port is single
   occupancy and the duplicate will exit with `EADDRINUSE`.

2. If nothing is listening, check the terminal list for an existing terminal
   whose purpose mentions the Mirage MCP server. If one exists but is not
   answering `/health`, read its last ~30 lines to see why (a port conflict and
   a crash need different responses), then kill it before continuing.

3. Start it in a persistent terminal — not a shell call, it is a long-lived
   foreground process:

   - command: `bun run mcp`
   - purpose: `Mirage MCP Streamable HTTP server on 127.0.0.1:8787/mcp`
   - title: `mirage mcp http :8787`
   - cwd: project root

   Then poll `curl -s -m 2 http://127.0.0.1:8787/health` until it succeeds,
   giving it a few seconds. If it never answers, read the terminal output and
   report the actual error rather than retrying blindly.

4. Restart the otto MCP connection so the tools attach to the live server:
   `forge` with action `execute`, kind `mcp-server`, name `mirage`,
   operation `restart`. Confirm the result reports `connected: true`.

## Notes

- If the user passed a port in the recipe arguments, use it for both the health
  URL and `MIRAGE_MCP_PORT` when starting, and tell them `.otto/config.json`
  needs the same port to match.
- The server reads `tools/mcp/.env` for `MIRAGE_NODE` (which node it queries)
  and the optional `MIRAGE_MNEMONIC`. Read tools work without a mnemonic. If
  `tools/mcp/.env` is missing entirely, copy `tools/mcp/.env.example` to it and
  mention that the wallet tool will return a configuration error until a
  mnemonic is set. Never print the mnemonic.
- It binds to loopback and has no auth. Do not expose it on a routable host.

## Report

One short paragraph: whether the server was already running or newly started,
the URL, the node it targets (from the `/health` response), and the number of
tools connected. Mention the terminal name so the user knows what is running.
