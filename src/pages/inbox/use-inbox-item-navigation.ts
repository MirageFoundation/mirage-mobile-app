import type { Href } from "expo-router";
import * as Sentry from "@sentry/react-native";
import type { RefObject } from "react";
import { useCallback, useRef } from "react";
import { Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { seedFocusedCommentFromInbox } from "@/src/api/cache";
import { getRootPostId } from "@/src/api/read/endpoints/posts";
import { queryKeys } from "@/src/api/read/query-keys";
import type { InboxReply } from "@/src/api/types";
import { useRouter } from "@/src/navigation/guarded-router";

type RootPostResolution = {
  rootPostId: string;
  source: "inbox-payload" | "root-post-id-query";
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

      Sentry.addBreadcrumb({
        category: "inbox",
        message: "Inbox item missing root post id; resolving from reply id",
        level: "warning",
        data: {
          replyId: reply.reply_id,
          rootPostId: reply.root_post_id,
          parentId: reply.parent_id,
          type: reply.type ?? "reply",
          platform: Platform.OS,
        },
      });

      try {
        const res = await queryClient.fetchQuery({
          queryKey: queryKeys.rootPostId(reply.reply_id),
          queryFn: () => getRootPostId({ comment_id: reply.reply_id }),
          staleTime: 1000 * 60 * 60,
        });
        if (isValidPostId(res.root_post_id)) {
          const elapsedMs = Date.now() - startedAt;
          Sentry.addBreadcrumb({
            category: "inbox",
            message: "Inbox item root post id resolved from reply id",
            level: "info",
            data: {
              replyId: reply.reply_id,
              resolvedRootPostId: res.root_post_id,
              parentId: reply.parent_id,
              type: reply.type ?? "reply",
              elapsedMs,
              hadNotificationContext: !!fromNotificationRef.current,
            },
          });
          return {
            rootPostId: res.root_post_id.trim(),
            source: "root-post-id-query",
            elapsedMs,
          };
        }
        Sentry.captureMessage("Inbox root post id query returned invalid id", {
          level: "warning",
          tags: {
            feature: "inbox",
            operation: "resolve-root-post-id",
            platform: Platform.OS,
            outcome: "invalid-response",
          },
          extra: {
            replyId: reply.reply_id,
            rootPostId: reply.root_post_id,
            resolvedRootPostId: res.root_post_id,
            parentId: reply.parent_id,
            type: reply.type ?? "reply",
            elapsedMs: Date.now() - startedAt,
            hadNotificationContext: !!fromNotificationRef.current,
          },
        });
      } catch (error) {
        Sentry.captureException(error, {
          tags: { feature: "inbox", operation: "resolve-root-post-id" },
          extra: {
            replyId: reply.reply_id,
            rootPostId: reply.root_post_id,
            parentId: reply.parent_id,
            platform: Platform.OS,
            elapsedMs: Date.now() - startedAt,
            hadNotificationContext: !!fromNotificationRef.current,
          },
        });
      }

      Sentry.captureMessage("Inbox item could not resolve root post", {
        level: "warning",
        tags: { feature: "inbox", operation: "open-reply" },
        extra: {
          replyId: reply.reply_id,
          rootPostId: reply.root_post_id,
          parentId: reply.parent_id,
          type: reply.type ?? "reply",
          platform: Platform.OS,
          elapsedMs: Date.now() - startedAt,
          hadNotificationContext: !!fromNotificationRef.current,
        },
      });
      return null;
    },
    [fromNotificationRef, queryClient],
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
        routerRef.current.navigate("/(tabs)/profile");
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

        routerRef.current.navigate("/(tabs)/profile");
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
