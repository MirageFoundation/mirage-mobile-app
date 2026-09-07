// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  buildQueuedActionIds,
  selectIsActionQueued,
} from "../src/services/pow-queue-index";
import {
  buildPendingPostIndex,
  selectPendingPost,
} from "../src/stores/pending-posts-index";
import {
  INITIAL_NETWORK_STATE,
  buildNetworkState,
  mergeNetworkState,
  selectIsConnected,
  selectNetworkType,
} from "../src/stores/network-state-model";

describe("post row scalar indexes", () => {
  test("pending post index updates and removes entries", () => {
    const first = { post_id: "Post-A", value: 1 };
    const second = { post_id: "post-b", value: 2 };
    const initial = buildPendingPostIndex([first, second]);

    expect(selectPendingPost(initial, "POST-A")).toBe(first);
    expect(selectPendingPost(initial, "post-b")).toBe(second);

    const updated = { ...first, value: 3 };
    const next = buildPendingPostIndex([updated]);
    expect(selectPendingPost(next, "post-a")).toBe(updated);
    expect(selectPendingPost(next, "post-b")).toBeUndefined();
  });

  test("queued action index updates and removes entries", () => {
    const initial = buildQueuedActionIds([{ id: "action-a" }, { id: "action-b" }]);
    expect(selectIsActionQueued(initial, "action-a")).toBe(true);
    expect(selectIsActionQueued(initial, undefined)).toBe(false);

    const next = buildQueuedActionIds([{ id: "action-b" }]);
    expect(selectIsActionQueued(next, "action-a")).toBe(false);
    expect(selectIsActionQueued(next, "action-b")).toBe(true);
  });

  test("network scalar selectors and unchanged snapshots are stable", () => {
    const wifi = buildNetworkState({
      isConnected: true,
      isInternetReachable: true,
      type: "wifi",
    });
    const unchanged = mergeNetworkState(wifi, { ...wifi });

    expect(unchanged).toBe(wifi);
    expect(selectIsConnected(unchanged)).toBe(true);
    expect(selectNetworkType(unchanged)).toBe("wifi");
    expect(selectIsConnected(INITIAL_NETWORK_STATE)).toBe(true);
  });

  test("mounted post row selectors avoid linear queue and pending scans", async () => {
    const paths = [
      "src/components/molecules/post-card.tsx",
      "src/pages/home/home-post-card-item.tsx",
      "src/pages/post/post-detail-content.tsx",
      "src/pages/post/post-media-page.tsx",
    ];

    for (const path of paths) {
      const source = await Bun.file(path).text();
      expect(source).not.toMatch(/state\.posts\.find\(/);
      expect(source).not.toMatch(/state\.queue\.some\(/);
    }
  });

  test("post cards do not duplicate network or scroll subscriptions", async () => {
    const card = await Bun.file("src/components/molecules/post-card.tsx").text();
    const media = await Bun.file(
      "src/components/molecules/post-card-media.tsx",
    ).text();
    const networkHook = await Bun.file("src/hooks/use-network-state.ts").text();
    const queryProvider = await Bun.file("src/providers/query-provider.tsx").text();
    const powQueue = await Bun.file("src/services/pow-queue.ts").text();

    expect(card).not.toContain("useIsFeedScrolling");
    expect(media).not.toContain("useNetworkState");
    expect(networkHook).not.toContain("expo-network");
    expect(queryProvider).not.toContain("NetInfo.addEventListener");
    expect(powQueue).not.toContain("expo-network");
  });
});
