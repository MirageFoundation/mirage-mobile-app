// @ts-nocheck -- Bun's test types are runtime-provided.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mediaRouteIndex, postMediaRoute, postMediaReturnRoute } from "../src/navigation/post-media-route";
import { sortPostComments } from "../src/pages/post/post-comment-sort";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("dedicated fullscreen media route", () => {
  test("fullscreen fades within its existing stack without changing other route transitions", () => {
    const stack = read("src/navigation/app-stack-layout.tsx");
    const optionsFor = (name) => stack.split(`name="${name}"`)[1]?.split("/>")[0];
    expect(optionsFor("post-media/[id]")).toContain('animation: "fade"');
    expect(optionsFor("post-media/[id]")).toContain("gestureEnabled: false");
    expect(optionsFor("post-media/[id]")).not.toContain("presentation:");
    expect(optionsFor("post/[id]")).toContain('animation: "fade"');
    expect(optionsFor("post/[id]")).toContain("animationDuration: 250");
    expect(optionsFor("(auth)")).toContain('animation: "slide_from_bottom"');
    expect(optionsFor("settings")).toContain('animation: "slide_from_right"');
    expect(optionsFor("p/[id]")).toContain('animation: "none"');
  });
  test("tapped index and shared playback scope survive navigation", () => {
    expect(postMediaRoute("p", 2, "feed:home")).toEqual({ pathname: "/post-media/[id]", params: { id: "p", index: "2", fromDetail: "true", reveal: "false", syncContext: "feed:home" } });
    expect(postMediaReturnRoute("p")).toBe("/post/p");
    expect(mediaRouteIndex("2", 4)).toBe(2);
    for (const index of ["-1", "NaN", "Infinity", "0.5", undefined]) expect(mediaRouteIndex(index, 4)).toBe(0);
    expect(mediaRouteIndex("99", 4)).toBe(3);
    expect(mediaRouteIndex("3", 0)).toBe(0);
  });
  test("fullscreen returns without replacing the underlying detail or focused comment", () => {
    const page = read("src/pages/post/post-media-page.tsx");
    expect(page).toContain("router.canGoBack() ? router.back()");
    expect(page).toContain("requestComments(id)");
    expect(page).toContain("usePostDetailPostState");
    expect(page).toContain("usePostDetailResolvedPost");
    expect(page).toContain("toggleSavePost(displayPost)");
    expect(page).toContain("PostDetailActionSheets");
    expect(page).toContain("hideCommentAction={!policy.canReply}");
    expect(page).toContain("policy.notice");
    expect(page).not.toMatch(/collapse|CommentsList|CommentInput|Modal/);
  });
  test("every gallery image has isolated zoom and video uses shared recovery", () => {
    const page = read("src/pages/post/post-media-page.tsx");
    const image = read("src/components/molecules/preview-image-item.tsx");
    const video = read("src/components/molecules/media-preview-video-item.tsx");
    expect(page).toContain("initialScrollIndex={selected}");
    expect(page).toContain("<PreviewImageItem");
    expect(image).toContain("usePreviewZoomGesture(width, height)");
    expect(image).toContain('contentFit="contain"');
    expect(video).toContain("isVideoPlayerControlledElsewhere");
    expect(video).toContain("useVideoSourceRecovery");
    expect(video).toContain("releaseHandoffPlayer");
    expect(video).toContain("VideoUnavailableOverlay");
    expect(page).toContain("shouldPrepare={active && selected === itemIndex}");
    expect(page).toContain("<PreviewVideoItem playbackControls");
  });
  test("comment sort ranks votes and dates without mutating original arrays or branches", () => {
    const comments = [{ id: "old", createdAt: 1, likes: 2, replies: [{ id: "reply" }] }, { id: "new", createdAt: 10, likes: 5 }];
    expect(sortPostComments(comments, "best").map((item) => item.id)).toEqual(["new", "old"]);
    const newest = sortPostComments(comments, "new");
    expect(newest.map((item) => item.id)).toEqual(["new", "old"]);
    expect(newest[1]).toBe(comments[0]);
    expect(sortPostComments(comments, "old").map((item) => item.id)).toEqual(["old", "new"]);
    expect(comments[0].id).toBe("old");
  });
});
