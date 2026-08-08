import { spawn, type ChildProcess } from "node:child_process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { MCP_URL } from "./env";

interface HttpEnvelope {
  status: number;
  ok: boolean;
  body: unknown;
}

function textOf(result: unknown): string {
  if (!result || typeof result !== "object" || !("content" in result)) {
    throw new Error("Tool returned no content");
  }
  const content = (result as { content: unknown }).content;
  if (!Array.isArray(content)) throw new Error("Tool returned invalid content");
  const item = content.find(
    (entry): entry is { type: "text"; text: string } =>
      Boolean(entry) && typeof entry === "object" && entry.type === "text" && typeof entry.text === "string",
  );
  if (!item) throw new Error("Tool returned no text content");
  return item.text;
}

function envelope(result: unknown): HttpEnvelope {
  return JSON.parse(textOf(result)) as HttpEnvelope;
}

function firstPost(body: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(body)) return body.find((item) => item && typeof item === "object");
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  for (const key of ["posts", "items", "results"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      const post = value.find((item) => item && typeof item === "object");
      if (post) return post as Record<string, unknown>;
    }
  }
  return undefined;
}

const healthUrl = new URL("/health", MCP_URL);

async function isServerUp(): Promise<boolean> {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1_000) });
    return response.ok;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Under HTTP the server is a separate long-lived process, so verification has
 * to either reuse a running one or start its own. Starting one keeps this a
 * single command while still exercising the real transport.
 */
async function startServer(): Promise<ChildProcess> {
  const child = spawn("bun", ["run", "tools/mcp/server.ts"], {
    cwd: process.cwd(),
    stdio: ["ignore", "ignore", "pipe"],
  });

  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await isServerUp()) return child;
    if (child.exitCode !== null) {
      throw new Error(`Server exited before becoming ready: ${stderr.trim()}`);
    }
    await sleep(100);
  }

  child.kill();
  throw new Error(`Server did not become ready at ${healthUrl}`);
}

const startedServer = (await isServerUp()) ? null : await startServer();
const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
const client = new Client({ name: "mirage-mcp-verifier", version: "1.0.0" });

try {
  await client.connect(transport);
  const tools = await client.listTools();

  const postsResponse = envelope(
    await client.callTool({ name: "mirage_get_posts", arguments: { limit: 1, by: "newest" } }),
  );
  if (!postsResponse.ok) throw new Error(`get_posts returned HTTP ${postsResponse.status}`);
  const post = firstPost(postsResponse.body);
  const postId = post?.id ?? post?.post_id;
  if (typeof postId !== "string" || !postId) throw new Error("Could not find a post ID in get_posts");

  const commentsResponse = envelope(
    await client.callTool({ name: "mirage_get_comments", arguments: { post_id: postId } }),
  );
  if (!commentsResponse.ok) throw new Error(`get_comments returned HTTP ${commentsResponse.status}`);
  const commentBody = commentsResponse.body as Record<string, unknown>;
  if (!("ancestors" in commentBody)) throw new Error("get_comments omitted ancestors");

  const walletResult = await client.callTool({ name: "mirage_wallet_address", arguments: {} });
  const wallet = JSON.parse(textOf(walletResult)) as { address?: string };
  if (!wallet.address?.startsWith("mirage1")) throw new Error("Wallet address is not mirage1 bech32");

  const statusResponse = envelope(
    await client.callTool({
      name: "mirage_get_user_status",
      arguments: { address: wallet.address },
    }),
  );
  if (!statusResponse.ok || !statusResponse.body || typeof statusResponse.body !== "object") {
    throw new Error(`get_user_status returned HTTP ${statusResponse.status}`);
  }

  console.log(
    JSON.stringify(
      {
        initialized: true,
        transport: "streamable-http",
        url: MCP_URL,
        server_started_by_verifier: startedServer !== null,
        tools: tools.tools.map((tool) => tool.name),
        posts_status: postsResponse.status,
        post_id: postId,
        comments_status: commentsResponse.status,
        comments_keys: Object.keys(commentBody),
        ancestors_present: Array.isArray(commentBody.ancestors),
        wallet_address: wallet.address,
        user_status_status: statusResponse.status,
        user_status_keys: Object.keys(statusResponse.body as Record<string, unknown>),
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
  startedServer?.kill();
}
