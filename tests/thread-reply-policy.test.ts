// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { getThreadReplyPolicy, LEGACY_THREAD_NOTICE, SERVED_LOCK_NOTICE } from "../src/domain/content";
import { assertReplyNotRejected, isReplyRejected, useReplyRejectionStore } from "../src/stores/reply-rejection-store";
import { queryKeys } from "../src/api/read/query-keys";

const server = "https://reply-policy.test";
const legacyError = { response: { data: { error_code: "legacy_thread_read_only" } } };

describe("thread reply policy", () => {
  test("protocol 0 unlocked permits replies without inventing chain metadata", () => {
    expect(getThreadReplyPolicy({ protocol_version: 0, thread_locked: false })).toEqual({
      canReply: true, reason: "can_reply", notice: null,
    });
  });

  test("missing/null protocol has no legacy verdict and stays unknown", () => {
    for (const root of [undefined, null, {}, { protocol_version: null }]) {
      expect(getThreadReplyPolicy(root).canReply).toBe(true);
      expect(getThreadReplyPolicy(root).notice).toBeNull();
      expect(root?.protocol_version == null).toBe(true);
    }
  });

  test("served lock blocks every protocol in that view, not raw", () => {
    for (const protocol_version of [0, 1, null, undefined]) {
      expect(getThreadReplyPolicy({ protocol_version, thread_locked: true })).toEqual({
        canReply: false, reason: "served_lock", notice: SERVED_LOCK_NOTICE,
      });
      expect(getThreadReplyPolicy({ protocol_version, thread_locked: false }).canReply).toBe(true);
      expect(getThreadReplyPolicy({ protocol_version }).canReply).toBe(true);
    }
  });

  test("explicit rejection only blocks the supplied immediate parent", () => {
    expect(getThreadReplyPolicy({ protocol_version: 1 }, true)).toEqual({
      canReply: false, reason: "legacy_rejection", notice: LEGACY_THREAD_NOTICE,
    });
    expect(getThreadReplyPolicy({ protocol_version: 0 }, false).canReply).toBe(true);
  });
});

describe("session reply rejection evidence", () => {
  test("only the explicit parsed code establishes rejection", () => {
    const store = useReplyRejectionStore.getState();
    for (const error of [new Error("network failed"), new Error("read-only"), { protocol_version: 0 }]) {
      store.recordRejection(server, "unknown", error);
    }
    expect(isReplyRejected(useReplyRejectionStore.getState(), server, "unknown")).toBe(false);
    store.recordRejection(server, "nested", legacyError);
    expect(isReplyRejected(useReplyRejectionStore.getState(), server, "NESTED")).toBe(true);
    expect(isReplyRejected(useReplyRejectionStore.getState(), server, "root")).toBe(false);
    expect(isReplyRejected(useReplyRejectionStore.getState(), server, "sibling")).toBe(false);
    expect(isReplyRejected(useReplyRejectionStore.getState(), "https://another.test", "nested")).toBe(false);
  });

  test("queued execution recheck stops submission after rejection, not siblings or votes", async () => {
    let submissions = 0;
    const execute = async (parentId) => {
      assertReplyNotRejected(server, parentId);
      submissions++;
    };
    await execute("queue-parent");
    useReplyRejectionStore.getState().recordRejection(server, "queue-parent", legacyError);
    expect(() => assertReplyNotRejected(server, "queue-parent")).toThrow("read-only");
    await expect(execute("queue-parent")).rejects.toThrow("read-only");
    await execute("queue-sibling");
    expect(submissions).toBe(2);
    // Reply evidence has no vote policy or vote-state ownership.
    expect(Object.keys(useReplyRejectionStore.getState()).sort()).toEqual(["recordRejection", "rejected"]);
  });

  test("comment snapshot rollback and refetch cannot erase explicit evidence", async () => {
    const client = new QueryClient();
    const key = queryKeys.commentsRoot();
    const snapshot = { root: { post_id: "rollback-parent", comments: 5 }, children: [] };
    client.setQueryData(key, snapshot);
    client.setQueryData(key, { ...snapshot, root: { ...snapshot.root, comments: 6 } });
    useReplyRejectionStore.getState().recordRejection(server, "rollback-parent", legacyError);
    client.setQueryData(key, snapshot);
    expect(client.getQueryData(key).root.comments).toBe(5);
    await client.fetchQuery({ queryKey: key, queryFn: async () => snapshot, staleTime: 0 });
    expect(isReplyRejected(useReplyRejectionStore.getState(), server, "rollback-parent")).toBe(true);
  });
});
