// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  flattenInboxReplies,
  isInboxReplyUnread,
  prependInboxPreview,
} from "../src/pages/inbox/inbox-state";

const reply = (replyId: string, timestamp: number) => ({
  reply_id: replyId,
  reply_timestamp: timestamp,
});

describe("inbox state mapping", () => {
  test("flattens pages in order while dropping invalid and duplicate replies", () => {
    const first = reply("first", 10);
    const duplicate = reply("first", 20);
    const second = reply("second", 30);

    expect(
      flattenInboxReplies([
        { replies: [first, null, { reply_timestamp: 15 }] },
        null,
        { replies: [duplicate, second] },
      ]),
    ).toEqual([first, second]);
  });

  test("prepends a notification preview only until its fetched reply is present", () => {
    const fetched = reply("fetched", 10);
    const preview = reply("preview", 20);
    const replies = [fetched];

    expect(prependInboxPreview(replies, preview)).toEqual([preview, fetched]);
    expect(prependInboxPreview([preview, fetched], preview)).toEqual([preview, fetched]);
    expect(prependInboxPreview(replies, null)).toBe(replies);
  });

  test("marks only post-baseline replies not explicitly read as unread", () => {
    const current = reply("current", 101);

    expect(isInboxReplyUnread(current, 100, new Set())).toBe(true);
    expect(isInboxReplyUnread(current, 101, new Set())).toBe(false);
    expect(isInboxReplyUnread(current, 100, new Set(["current"]))).toBe(false);
  });
});
