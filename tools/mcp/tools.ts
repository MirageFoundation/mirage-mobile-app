import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import { apiGet, type ApiResponse, type Query } from "./api";
import { getMnemonic } from "./env";
import { addressFromMnemonic } from "./wallet";

const address = z.string().min(1).describe("Mirage bech32 address used as the viewer context.");
const allowedTags = z
  .string()
  .optional()
  .describe("Comma-separated content tags allowed in results, such as sensitive,adult.");

function result(response: ApiResponse) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
    isError: !response.ok,
  };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

async function get(path: string, query: Query = {}) {
  try {
    return result(await apiGet(path, query));
  } catch (error) {
    return failure(error);
  }
}

const rawQueryValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
]);

/**
 * Build a fully configured server instance.
 *
 * The HTTP transport runs stateless, creating one server per request, so
 * registration must be repeatable rather than module-level side effects.
 */
export function createMirageMcpServer(): McpServer {
  const server = new McpServer({ name: "mirage-node", version: "1.0.0" });

  server.registerTool(
    "mirage_get_posts",
    {
      description:
        "Fetch Mirage posts. Supports public topic feeds and viewer-aware home/following feeds.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe("Posts per page (1-100)."),
        page: z.number().int().min(1).optional().describe("One-based page number."),
        topic: z.string().min(1).optional().describe("Limit results to this topic."),
        address: address.optional(),
        feed: z.enum(["home", "following"]).optional().describe("Personalized feed mode."),
        by: z.enum(["magic", "newest", "top"]).optional().describe("Requested sort mode."),
        allowed_tags: allowedTags,
      },
    },
    async (args) => get("get_posts", args),
  );

  server.registerTool(
    "mirage_get_comments",
    {
      description:
        "Fetch a complete Mirage thread. Returns root, nested children, root-post-first ancestors, and ancestors_omitted.",
      inputSchema: {
        post_id: z.string().min(1).describe("Post or comment ID whose thread should be loaded."),
        address: address.optional(),
      },
    },
    async (args) => get("get_comments", args),
  );

  server.registerTool(
    "mirage_get_user_posts",
    {
      description: "Fetch posts or comments authored by a Mirage account.",
      inputSchema: {
        owner: address.describe("Address of the content owner."),
        address: address.optional(),
        type: z.string().optional().describe("Content type filter, for example comments."),
        page: z.number().int().min(1).optional().describe("One-based page number."),
        limit: z.number().int().min(1).max(50).optional().describe("Results per page (1-50)."),
        allowed_tags: allowedTags,
      },
    },
    async (args) => get("get_user_posts", args),
  );

  server.registerTool(
    "mirage_get_profile",
    {
      description: "Fetch the indexed public profile for a Mirage address.",
      inputSchema: { address: address.describe("Profile owner address.") },
    },
    async (args) => get("get_profile", args),
  );

  server.registerTool(
    "mirage_get_user_status",
    {
      description: "Fetch dynamic account status such as balance, level, and subscription data.",
      inputSchema: { address },
    },
    async (args) => get("get_user_status", args),
  );

  server.registerTool(
    "mirage_bootstrap",
    {
      description:
        "Fetch node and chain configuration, optionally with account state and an initial feed, thread, inbox, or topic view.",
      inputSchema: {
        address: address.optional(),
        view: z
          .string()
          .optional()
          .describe("Initial view, for example feed:home, thread:<id>, inbox, or topic:<name>."),
        by: z.string().optional().describe("Sort mode for an embedded feed view."),
        allowed_tags: allowedTags,
        limit: z.number().int().min(1).max(100).optional().describe("Embedded view result limit."),
      },
    },
    async (args) => get("bootstrap", args),
  );

  server.registerTool(
    "mirage_get_inbox",
    {
      description: "Fetch notifications and inbox activity for a Mirage address.",
      inputSchema: { address },
    },
    async (args) => get("get_inbox", args),
  );

  server.registerTool(
    "mirage_search",
    {
      description: "Search Mirage topics, users, and posts. Prefix q with @ for users or # for topics.",
      inputSchema: {
        q: z.string().min(1).describe("Search query."),
        type: z.enum(["topics", "users", "posts"]).optional().describe("Limit results to one type."),
        limit: z.number().int().min(1).max(50).optional().describe("Results per type (1-50)."),
        offset: z.number().int().min(0).optional().describe("Pagination offset."),
        address: address.optional(),
        allowed_tags: allowedTags,
      },
    },
    async (args) => get("search", args),
  );

  server.registerTool(
    "mirage_get_topics",
    {
      description: "Fetch the most active Mirage topics.",
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional().describe("Maximum topics (1-200)."),
        min_posts: z.number().int().min(0).optional().describe("Minimum post count per topic."),
        allowed_tags: allowedTags,
      },
    },
    async (args) => get("get_topics", args),
  );

  server.registerTool(
    "mirage_raw_get",
    {
      description:
        "Send a read-only GET request to an arbitrary endpoint under /api/. Use this to inspect endpoints not covered by dedicated tools.",
      inputSchema: {
        path: z.string().min(1).describe("Relative API path, with or without the api/ prefix."),
        query: z.record(z.string(), rawQueryValue).optional().describe("Arbitrary query parameters."),
      },
    },
    async ({ path, query }) => get(path, query ?? {}),
  );

  server.registerTool(
    "mirage_wallet_address",
    {
      description:
        "Derive the mirage1 bech32 address for MIRAGE_MNEMONIC using the app's Cosmos HD path. Never returns the mnemonic.",
      inputSchema: {},
    },
    async () => {
      const mnemonic = getMnemonic();
      if (!mnemonic) {
        return failure(new Error("Wallet not configured: set MIRAGE_MNEMONIC in tools/mcp/.env"));
      }
      try {
        const walletAddress = addressFromMnemonic(mnemonic);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ address: walletAddress }, null, 2) },
          ],
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}
