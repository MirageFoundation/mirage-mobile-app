import * as Notifications from "expo-notifications";
import * as Sentry from "@sentry/react-native";

import type { InboxReply, InboxResponse } from "@/src/api/types";

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

function formatMirageAmount(amountUmirage: number): string {
  const value = amountUmirage / 1_000_000;
  const text = value % 1 === 0 ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return text;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toOptionalNumber(value: unknown): number | undefined {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
}

function normalizeInboxReplyType(value: unknown): InboxReply["type"] {
  switch (value) {
    case "reply":
    case "mention":
    case "award":
    case "donation":
    case "follow":
    case "subscription_gift":
      return value;
    default:
      return "reply";
  }
}

export function getNotificationData(
  response: Notifications.NotificationResponse,
): Record<string, unknown> {
  return (response.notification?.request?.content?.data ?? {}) as Record<string, unknown>;
}

export function getNotificationDataKeys(data: Record<string, unknown>): string[] {
  return Object.keys(data).slice(0, 20);
}

export function isAndroidShareIntentNotificationData(data: Record<string, unknown>): boolean {
  const keys = Object.keys(data);
  return keys.some((key) =>
    key === "android.intent.extra.TEXT" ||
    key === "android.intent.extra.STREAM" ||
    key === "android.intent.extra.SUBJECT" ||
    key.startsWith("android.intent.extra."),
  );
}

function getFallbackInboxNotificationResponseId(
  response: Notifications.NotificationResponse,
  data: Record<string, unknown>,
): string {
  const notificationDate = response.notification?.date ?? Date.now();
  const dataKeys = getNotificationDataKeys(data).join(",") || "no-data";
  Sentry.addBreadcrumb({
    category: "inbox-notifications",
    message: "Using fallback inbox notification response id",
    level: "warning",
    data: {
      actionIdentifier: response.actionIdentifier,
      requestIdentifier: response.notification?.request?.identifier,
      notificationDate,
      dataKeys: getNotificationDataKeys(data),
      hasNotificationType: !!data.notificationType,
      hasReplyId: !!toOptionalString(data.replyId),
      hasRootPostId: !!toOptionalString(data.rootPostId),
      hasInboxReply: !!data.inboxReply,
    },
  });
  return `inbox-notification:${response.actionIdentifier}:${notificationDate}:${dataKeys}`;
}

export function getInboxNotificationResponseId(
  response: Notifications.NotificationResponse,
  data: Record<string, unknown>,
): string {
  const explicitNotificationId = toOptionalString(data.notificationId);
  if (explicitNotificationId) return explicitNotificationId;

  const replyId = toOptionalString(data.replyId);
  if (replyId) return `inbox-reply:${replyId}`;

  const rootPostId = toOptionalString(data.rootPostId);
  if (rootPostId) return `inbox-root:${rootPostId}`;

  const snapshot = data.inboxReply;
  if (snapshot && typeof snapshot === "object") {
    const snapshotReplyId = toOptionalString(
      (snapshot as Record<string, unknown>).reply_id,
    );
    if (snapshotReplyId) return `inbox-reply:${snapshotReplyId}`;
  }

  const requestId = toOptionalString(response.notification?.request?.identifier);
  if (requestId) return requestId;

  return getFallbackInboxNotificationResponseId(response, data);
}

export function buildPreviewReplyFromNotification(
  notification: Notifications.Notification,
): InboxReply | null {
  const data = (notification.request.content.data ?? {}) as Record<string, unknown>;
  const snapshot = data.inboxReply;
  const notificationDate = notification.date;
  const replyTimestamp = notificationDate
    ? Math.floor((notificationDate < 1e12 ? notificationDate * 1000 : notificationDate) / 1000)
    : Math.floor(Date.now() / 1000);

  if (snapshot && typeof snapshot === "object") {
    const candidate = snapshot as Record<string, unknown>;
    const replyId = toOptionalString(candidate.reply_id);
    const rootPostId = toOptionalString(candidate.root_post_id);
    if (replyId && rootPostId) {
      return {
        reply_id: replyId,
        reply_owner: toOptionalString(candidate.reply_owner) ?? "",
        reply_username: toOptionalString(candidate.reply_username) ?? "Someone",
        reply_content: toOptionalString(candidate.reply_content) ?? "",
        reply_timestamp:
          toOptionalNumber(candidate.reply_timestamp) ?? replyTimestamp,
        reply_author_level:
          toOptionalNumber(candidate.reply_author_level) ?? 0,
        parent_id: toOptionalString(candidate.parent_id) ?? rootPostId,
        parent_content: toOptionalString(candidate.parent_content) ?? "",
        parent_owner: toOptionalString(candidate.parent_owner) ?? "",
        root_post_id: rootPostId,
        type: normalizeInboxReplyType(candidate.type),
        award_type: toOptionalString(candidate.award_type) ?? undefined,
        amount: toOptionalNumber(candidate.amount),
      };
    }
  }

  const replyId = toOptionalString(data.replyId);
  const rootPostId = toOptionalString(data.rootPostId);
  if (!replyId || !rootPostId) {
    return null;
  }

  const title = notification.request.content.title?.trim() ?? "";
  const body = notification.request.content.body?.trim() ?? "";
  const fallbackUsername = title.match(/^@?([^\s]+)/)?.[1] ?? "Someone";

  return {
    reply_id: replyId,
    reply_owner: toOptionalString(data.replyOwner) ?? "",
    reply_username: toOptionalString(data.replyUsername) ?? fallbackUsername,
    reply_content: toOptionalString(data.replyContent) ?? body,
    reply_timestamp: replyTimestamp,
    reply_author_level: toOptionalNumber(data.replyAuthorLevel) ?? 0,
    parent_id: toOptionalString(data.parentId) ?? rootPostId,
    parent_content: toOptionalString(data.parentContent) ?? "",
    parent_owner: toOptionalString(data.parentOwner) ?? "",
    root_post_id: rootPostId,
    type: normalizeInboxReplyType(data.type),
    award_type: toOptionalString(data.awardType) ?? undefined,
    amount: toOptionalNumber(data.amount),
  };
}

export function getNotificationBody(reply: InboxResponse["replies"][number]): string {
  if (reply.type === "donation") {
    return "You received a donation";
  }
  if (reply.type === "follow") {
    return "Tap to view their profile";
  }
  if (reply.type === "subscription_gift") {
    return "Welcome to Mirage";
  }
  if (reply.type === "award") {
    return `Your post received a ${reply.award_type ?? ""}  award`;
  }
  return truncate(reply.reply_content, 150);
}

export function getNotificationTitle(reply: InboxResponse["replies"][number]): string {
  const displayName = reply.reply_username ? `@${reply.reply_username}` : reply.reply_owner?.slice(0, 12) ?? "";
  if (reply.type === "mention") {
    return `${displayName} mentioned you`;
  }
  if (reply.type === "donation") {
    const amount = formatMirageAmount(reply.amount ?? 0);
    return `${displayName} donated ${amount} MIRAGE`;
  }
  if (reply.type === "follow") {
    return `${displayName} followed you`;
  }
  if (reply.type === "subscription_gift") {
    return `${displayName} gifted you a subscription`;
  }
  if (reply.type === "award") {
    return `${displayName} gave you an award`;
  }
  return `${displayName} replied`;
}
