import type { Href } from "expo-router";
import * as Sentry from "@sentry/react-native";
import type { RefObject } from "react";
import { useCallback, useRef } from "react";
import { Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { seedFocusedCommentFromInbox } from "@/src/api/cache";
import type { InboxReply } from "@/src/api/types";
import { useRouter } from "@/src/navigation/guarded-router";

type RootPostResolution = {
  /** Thread entry point: the root post when known, else the reply itself. */
  rootPostId: string;
  source: "inbox-payload" | "reply-id-fallback";
  elapsedMs: number;
};

type InboxItemNavigationOptions = {
  walletAddress?: string;
  fromNotificationRef: RefObject<string | undefined>;
  markReplyAsRead: (replyId: string) => void;
};

function isValidPostId(value?: string | null): value is string {
  const normalized = value?.trim();
  return !!normalized && normalized !== "undefined" && normalized !== "null";
}

export function useInboxItemNavigation({
  walletAddress,
  fromNotificationRef,
  markReplyAsRead,
}: InboxItemNavigationOptions) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const routerRef = useRef(router);
  routerRef.current = router;

  const seedFocusedComment = useCallback(
    (reply: InboxReply) => {
      const address = walletAddress ?? undefined;
      seedFocusedCommentFromInbox(queryClient, reply, address);
    },
    [queryClient, walletAddress],
  );

  const buildPostHref = useCallback(
    (rootPostId: string, options: { highlight?: string } = {}) => {
      const queryParams: string[] = [];
      if (options.highlight) {
        queryParams.push(`highlight=${encodeURIComponent(options.highlight)}`);
      }
      const notificationId = fromNotificationRef.current;
      if (notificationId) {
        queryParams.push(`fromNotification=${encodeURIComponent(notificationId)}`);
      }
      const query = queryParams.length > 0 ? `?${queryParams.join("&")}` : "";
      return `/post/${encodeURIComponent(rootPostId)}${query}` as Href;
    },
    [fromNotificationRef],
  );

  const resolveRootPostId = useCallback(
    async (reply: InboxReply): Promise<RootPostResolution | null> => {
      const startedAt = Date.now();
      if (isValidPostId(reply.root_post_id)) {
        return {
          rootPostId: reply.root_post_id.trim(),
          source: "inbox-payload",
          elapsedMs: Date.now() - startedAt,
        };
      }

      // No root post id in the payload. Previously this cost a blocking
      // `get_root_post_id` round trip before we could navigate. The thread
      // endpoint accepts a comment id directly and returns the ancestor chain,
      // so we open the reply itself and let the detail screen derive the root
      // from `ancestors[0]` — navigation stays instant.
      if (!isValidPostId(reply.reply_id)) {
        Sentry.captureMessage("Inbox item could not resolve a thread entry point", {
          level: "warning",
          tags: { feature: "inbox", operation: "open-reply" },
          extra: {
            replyId: reply.reply_id,
            rootPostId: reply.root_post_id,
            parentId: reply.parent_id,
            type: reply.type ?? "reply",
            platform: Platform.OS,
            hadNotificationContext: !!fromNotificationRef.current,
          },
        });
        return null;
      }

      Sentry.addBreadcrumb({
        category: "inbox",
        message: "Inbox item missing root post id; opening the reply directly",
        level: "info",
        data: {
          replyId: reply.reply_id,
          rootPostId: reply.root_post_id,
          parentId: reply.parent_id,
          type: reply.type ?? "reply",
          platform: Platform.OS,
        },
      });

      return {
        rootPostId: reply.reply_id.trim(),
        source: "reply-id-fallback",
        elapsedMs: Date.now() - startedAt,
      };
    },
    [fromNotificationRef],
  );

  const handleItemPress = useCallback(
    async (reply: InboxReply) => {
      markReplyAsRead(reply.reply_id);
      const notificationId = fromNotificationRef.current;
      Sentry.addBreadcrumb({
        category: "inbox",
        message: "Inbox item press received",
        level: "info",
        data: {
          replyId: reply.reply_id,
          rootPostId: reply.root_post_id,
          hasValidRootPostId: isValidPostId(reply.root_post_id),
          parentId: reply.parent_id,
          type: reply.type ?? "reply",
          hasReplyContent: !!reply.reply_content?.trim(),
          notificationId,
          hasFromNotification: !!notificationId,
          platform: Platform.OS,
        },
      });

      if (reply.type === "donation") {
        routerRef.current.navigate("/profile");
        return;
      }

      if (reply.type === "follow" && reply.reply_owner) {
        routerRef.current.push(`/user/${reply.reply_owner}`);
        return;
      }

      if (reply.type === "subscription_gift") {
        if (Platform.OS === "android") {
          routerRef.current.push("/subscription");
          return;
        }

        routerRef.current.navigate("/profile");
        return;
      }

      const rootResolution = await resolveRootPostId(reply);
      if (!rootResolution) return;
      const { rootPostId } = rootResolution;
      const replyForNavigation =
        reply.root_post_id === rootPostId ? reply : { ...reply, root_post_id: rootPostId };

      if (!reply.reply_content?.trim()) {
        const href = buildPostHref(rootPostId);
        Sentry.addBreadcrumb({
          category: "inbox",
          message: "Inbox item opened post without comment highlight",
          level: "info",
          data: {
            replyId: reply.reply_id,
            rootPostId,
            parentId: reply.parent_id,
            type: reply.type ?? "reply",
            notificationId,
            hasFromNotification: !!notificationId,
            rootResolutionSource: rootResolution.source,
            rootResolutionElapsedMs: rootResolution.elapsedMs,
            href,
          },
        });
        try {
          routerRef.current.push(href);
        } catch (error) {
          Sentry.captureException(error, {
            tags: { feature: "inbox", operation: "open-post-detail" },
            extra: { replyId: reply.reply_id, rootPostId, href, platform: Platform.OS },
          });
          throw error;
        }
        return;
      }

      const href = buildPostHref(rootPostId, { highlight: reply.reply_id });
      Sentry.addBreadcrumb({
        category: "inbox",
        message: "Inbox reply opened focused comment detail",
        level: "info",
        data: {
          replyId: reply.reply_id,
          rootPostId,
          parentId: reply.parent_id,
          type: reply.type ?? "reply",
          notificationId,
          hasFromNotification: !!notificationId,
          rootResolutionSource: rootResolution.source,
          rootResolutionElapsedMs: rootResolution.elapsedMs,
          href,
        },
      });
      seedFocusedComment(replyForNavigation);
      try {
        routerRef.current.push(href);
      } catch (error) {
        Sentry.captureException(error, {
          tags: { feature: "inbox", operation: "open-focused-comment-detail" },
          extra: { replyId: reply.reply_id, rootPostId, href, platform: Platform.OS },
        });
        throw error;
      }
    },
    [
      buildPostHref,
      fromNotificationRef,
      markReplyAsRead,
      resolveRootPostId,
      seedFocusedComment,
    ],
  );

  return handleItemPress;
}
