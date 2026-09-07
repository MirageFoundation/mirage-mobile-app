// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import { seedFocusedCommentFromInbox } from "../src/api/cache/inbox-cache";
import { queryKeys } from "../src/api/read/query-keys";
import { ServerRequestCoordinator } from "../src/api/server-runtime";

new ServerRequestCoordinator("https://node.example");

const reply = {
  reply_id: "reply-1",
  reply_owner: "mirage1author",
  reply_username: "author",
  reply_author_level: 0,
  reply_timestamp: 1,
  root_post_id: "root-1",
  reply_content: "hello",
};

describe("inbox focused-comment seeding", () => {
  test("seeds only the matching comments key", () => {
    const queryClient = new QueryClient();
    seedFocusedCommentFromInbox(queryClient, reply, "mirage1viewer");

    const defaultKey = queryKeys.comments("reply-1", "mirage1viewer");
    const rawKey = queryKeys.comments("reply-1", "mirage1viewer", { lens: "raw" });
    expect(queryClient.getQueryData(defaultKey)?.root?.post_id).toBe("reply-1");
    expect(queryClient.getQueryData(rawKey)).toBeUndefined();
  });

  test("optional lens request seeds that exact comments identity", () => {
    const queryClient = new QueryClient();
    seedFocusedCommentFromInbox(
      queryClient,
      reply,
      "mirage1viewer",
      { lens: "raw", scope: "current" },
    );

    expect(queryClient.getQueryData(
      queryKeys.comments("reply-1", "mirage1viewer"),
    )).toBeUndefined();
    expect(queryClient.getQueryData(
      queryKeys.comments("reply-1", "mirage1viewer", { lens: "raw" }),
    )?.root?.post_id).toBe("reply-1");
  });
});
