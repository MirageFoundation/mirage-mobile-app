// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  buildSignupShareUrl,
  canShareSignupUrl,
  copySignupShareUrl,
  shareSignupShareUrl,
} from "../src/utils/signup-share-url";

describe("signup share URL", () => {
  test("builds encoded invite and referral signup URLs", () => {
    expect(buildSignupShareUrl("https://mirage.talk", { invite: "ABC-123" })).toBe(
      "https://mirage.talk/signup?invite=ABC-123",
    );
    expect(buildSignupShareUrl("https://mirage.talk", { ref: "alice" })).toBe(
      "https://mirage.talk/signup?ref=alice",
    );
    expect(buildSignupShareUrl("https://mirage.talk", { ref: "alice/bob" })).toBe(
      "https://mirage.talk/signup?ref=alice%2Fbob",
    );
    expect(buildSignupShareUrl("https://mirage.talk", { invite: "  code  " })).toBe(
      "https://mirage.talk/signup?invite=code",
    );
    expect(buildSignupShareUrl("https://mirage.talk", { invite: "", ref: "   " })).toBeNull();
    expect(buildSignupShareUrl("https://mirage.talk", {})).toBeNull();
  });

  test("prefers invite over referral when both are present", () => {
    expect(buildSignupShareUrl("https://mirage.talk", {
      invite: "invite-1",
      ref: "alice",
    })).toBe("https://mirage.talk/signup?invite=invite-1");
  });

  test("copy and share handlers skip empty or disabled URLs", async () => {
    const copied: string[] = [];
    const shared: unknown[] = [];

    expect(canShareSignupUrl(null, true)).toBe(false);
    expect(canShareSignupUrl("https://mirage.talk/signup?ref=alice", false)).toBe(false);
    expect(await copySignupShareUrl(null, true, async (value) => {
      copied.push(value);
    })).toBe("skipped");
    expect(await copySignupShareUrl("https://mirage.talk/signup?ref=alice", false, async (value) => {
      copied.push(value);
    })).toBe("skipped");
    expect(await shareSignupShareUrl("", true, async (payload) => {
      shared.push(payload);
    })).toBe("skipped");
    expect(copied).toEqual([]);
    expect(shared).toEqual([]);
  });

  test("copy writes the exact URL and share sends that payload", async () => {
    const url = "https://mirage.talk/signup?ref=alice";
    const copied: string[] = [];

    expect(await copySignupShareUrl(url, true, async (value) => {
      copied.push(value);
    })).toBe("copied");
    expect(copied).toEqual([url]);

    expect(await shareSignupShareUrl(url, true, async (payload) => payload)).toBe("shared");
    expect(await shareSignupShareUrl(url, true, async () => {
      throw new Error("dismissed");
    })).toBe("dismissed");
  });

  test("copy failures propagate so the UI can toast", async () => {
    await expect(copySignupShareUrl(
      "https://mirage.talk/signup?invite=code",
      true,
      async () => {
        throw new Error("clipboard unavailable");
      },
    )).rejects.toThrow("clipboard unavailable");
  });
});
