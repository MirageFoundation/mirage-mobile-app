# Mirage Node MCP Server

A standalone MCP server for inspecting the Mirage node HTTP API. It is development tooling and is not bundled into the Expo app.

It speaks **Streamable HTTP**, not stdio, so client configuration is a URL that is identical on every machine. A stdio entry would have to be checked in as an absolute path to `tools/mcp/server.ts`, which is wrong for anyone whose checkout lives elsewhere.

The tradeoff: this process must be running before a client connects.

## Run

From the repository root:

```sh
bun run mcp
```

It logs the listening URL and stays in the foreground. Default endpoint:

```
http://127.0.0.1:8787/mcp
```

`GET /health` returns `{ ok, node, endpoint }` and is a cheap way to check whether an instance is already up.

The entrypoint uses `node:http`, so `node tools/mcp/server.ts` works too on a runtime that can load TypeScript.

## Client configuration

Already registered for this repo in `.otto/config.json`:

```json
{
  "name": "mirage",
  "transport": "http",
  "url": "http://127.0.0.1:8787/mcp"
}
```

Nothing in that entry is machine specific. Change the port in both places if `8787` is taken.

## Verify

```sh
bun run mcp:verify
```

Connects over HTTP, lists tools, and exercises `mirage_get_posts` → `mirage_get_comments` → `mirage_wallet_address` → `mirage_get_user_status` against the live node. It reuses a running server if one answers `/health`, otherwise it starts one for the duration of the check and shuts it down afterwards.

## Environment

Copy `tools/mcp/.env.example` to `tools/mcp/.env` and configure:

- `MIRAGE_NODE`: node base URL. Defaults to `https://mirage.talk`; `https://mirage.vote` is also a production node.
- `MIRAGE_MNEMONIC`: optional wallet mnemonic used only to derive the viewer's public `mirage1...` address.
- `MIRAGE_MCP_HOST`: listen address. Defaults to `127.0.0.1`.
- `MIRAGE_MCP_PORT`: listen port. Defaults to `8787`.
- `MIRAGE_MCP_ENDPOINT`: request path. Defaults to `mcp`.

The server loads `tools/mcp/.env` itself, while already-set process environment variables take precedence. Read tools work without a mnemonic. `mirage_wallet_address` returns a clear configuration error when it is absent.

## Tools

- `mirage_get_posts` - fetch topic, home, or following posts.
- `mirage_get_comments` - fetch a thread including `root`, `children`, `ancestors`, and `ancestors_omitted`.
- `mirage_get_user_posts` - fetch content authored by an account.
- `mirage_get_profile` - fetch an indexed public profile.
- `mirage_get_user_status` - fetch dynamic account status.
- `mirage_bootstrap` - fetch node/chain configuration and optional first-view data.
- `mirage_get_inbox` - fetch account inbox activity.
- `mirage_search` - search topics, users, and posts.
- `mirage_get_topics` - fetch active topics.
- `mirage_raw_get` - send an arbitrary GET request to a path restricted to `/api/`.
- `mirage_wallet_address` - derive the configured mnemonic's public Mirage address.

Every HTTP tool returns the requested URL, HTTP status, success flag, and parsed response body. Non-2xx responses are returned as MCP tool errors with the response body intact. Requests time out after 20 seconds.

Tool registration lives in `tools.ts` as a `createMirageMcpServer()` factory. The HTTP transport runs stateless — one server and transport per request — so registration has to be repeatable rather than a module-level side effect.

## Security

The server binds to `127.0.0.1` by default and has no authentication. Do not set `MIRAGE_MCP_HOST` to a routable address: anything that can reach the port can call every tool, including `mirage_wallet_address`.

`tools/mcp/.env` and matching local environment files are gitignored. Never commit a wallet mnemonic, put it in client configuration, or send it to a node. Only the derived public address may be returned by the wallet tool.

This server is intentionally read-only. Signed transactions, envelope signing, proof of work, and all write tools are future work.
