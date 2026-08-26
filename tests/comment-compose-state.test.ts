// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  getCommentComposeLimits,
  getInitialCommentComposeState,
  getLinkError,
  prependMarkdownLink,
  removeMarkdownLink,
} from "../src/pages/comment/comment-compose-state";

describe("comment compose state mapping", () => {
  test("maps edit content attachments without leaking a saved draft", () => {
    expect(
      getInitialCommentComposeState({
        draft: { text: "draft", imageUri: "file:///wallet/photo.jpg" },
        editContent: "edited\nhttps://media.giphy.com/media/id/giphy.gif",
        isEditMode: true,
      }),
    ).toEqual({
      text: "edited",
      imageUri: null,
      gifUrl: "https://media.giphy.com/media/id/giphy.gif",
      isRemoteImage: false,
    });
  });

  test("restores local wallet-scoped media from a draft", () => {
    expect(
      getInitialCommentComposeState({
        draft: { text: "draft", imageUri: "file:///wallet/photo.jpg" },
        isEditMode: false,
      }),
    ).toEqual({
      text: "draft",
      imageUri: "file:///wallet/photo.jpg",
      gifUrl: null,
      isRemoteImage: false,
    });
  });

  test("validates and maps markdown links", () => {
    expect(getLinkError("mirage.net")).toBe("Add https:// to the beginning of your link");
    expect(getLinkError("https://mirage.net/post")).toBeNull();
    expect(prependMarkdownLink("body", " Mirage ", " https://mirage.net ")).toBe(
      "[Mirage](https://mirage.net)\nbody",
    );
    expect(removeMarkdownLink("[Mirage](https://mirage.net)\n\nbody", "[Mirage](https://mirage.net)"))
      .toBe("body");
  });

  test("accounts for attachment overhead and upload blockers", () => {
    expect(
      getCommentComposeLimits({
        attachmentUrl: "https://image.test/a.jpg",
        editExpired: false,
        imageError: null,
        imageUploading: false,
        isPreparingImage: false,
        isSubmitting: false,
        maxContentLength: 100,
        text: "",
      }),
    ).toEqual({ effectiveMaxLength: 74, canSubmit: true });

    expect(
      getCommentComposeLimits({
        attachmentUrl: "file:///photo.jpg",
        editExpired: false,
        imageError: null,
        imageUploading: true,
        isPreparingImage: false,
        isSubmitting: false,
        maxContentLength: 100,
        text: "ready",
      }).canSubmit,
    ).toBe(false);
  });
});
