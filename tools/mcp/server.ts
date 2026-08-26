import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { MCP_ENDPOINT, MCP_HOST, MCP_PORT, MIRAGE_NODE } from "./env";
import { createMirageMcpServer } from "./tools";

/**
 * Streamable HTTP MCP server.
 *
 * HTTP rather than stdio so client configuration is a URL, not a machine
 * specific absolute path to this file — a stdio entry has to be checked in as
 * `/Users/<someone>/.../tools/mcp/server.ts`, which is wrong on every other
 * machine. The tradeoff is that this process must be running before a client
 * connects: start it with `bun run mcp`.
 *
 * Built on `node:http` and the SDK's Node transport rather than `Bun.serve`, so
 * the same entrypoint runs under either runtime and needs no Bun-only types.
 *
 * Stateless mode (`sessionIdGenerator: undefined`): each request gets a fresh
 * server and transport, so there is no session table to leak and a client can
 * reconnect at any time without a handshake. `enableJsonResponse` makes POST
 * responses complete JSON documents, so tearing the pair down once the response
 * finishes cannot truncate a live stream.
 */
async function handleMcpRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const server = createMirageMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  response.on("close", () => {
    void transport.close().catch(() => {});
    void server.close().catch(() => {});
  });

  await server.connect(transport);
  await transport.handleRequest(request, response);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function sendJsonRpcError(
  response: ServerResponse,
  status: number,
  code: number,
  message: string,
): void {
  sendJson(response, status, { jsonrpc: "2.0", error: { code, message }, id: null });
}

const httpServer = createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", `http://${request.headers.host ?? MCP_HOST}`)
    .pathname;

  if (pathname === "/health") {
    sendJson(response, 200, { ok: true, node: MIRAGE_NODE, endpoint: MCP_ENDPOINT });
    return;
  }

  if (pathname !== MCP_ENDPOINT) {
    sendJsonRpcError(response, 404, -32601, `Not found. MCP endpoint is ${MCP_ENDPOINT}`);
    return;
  }

  handleMcpRequest(request, response).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    // Never surface a stack trace to the client; the console keeps the detail.
    console.error(`[mirage-mcp] request failed: ${message}`);
    if (!response.headersSent) {
      sendJsonRpcError(response, 500, -32603, "Internal server error");
    } else {
      response.end();
    }
  });
});

httpServer.listen(MCP_PORT, MCP_HOST, () => {
  // stdout is a plain log here (not a protocol channel as it was under stdio).
  console.log(
    `[mirage-mcp] listening on http://${MCP_HOST}:${MCP_PORT}${MCP_ENDPOINT} (node: ${MIRAGE_NODE})`,
  );
});

httpServer.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `[mirage-mcp] port ${MCP_PORT} is in use. Another instance may already be running, or set MIRAGE_MCP_PORT.`,
    );
    process.exit(1);
  }
  throw error;
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    httpServer.close(() => process.exit(0));
  });
}
