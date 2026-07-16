import { describe, expect, test } from "bun:test";

import {
  hasTransientPostSuccess,
  mergeRefreshedPostPreservingOrder,
  setTransientPostSuccessInData,
} from "../src/api/cache/transient-post-success.ts";
import { clearOptimisticVideoProcessingFromData } from "../src/api/cache/optimistic-video-processing.ts";

const post = (id, status) => ({
  post_id: id,
  user_id: "user",
  username: "user",
  timestamp: 1,
  topic: "test",
  root_topic: "test",
  root_post_id: id,
  title: id,
  content: "",
  tag: "",
  edited_at: 0,
  thumbnail: "",
  media: [],
  points: 1,
  comments: 0,
  user_vote: 1,
  user_weight: 1,
  optimistic_status: status,
});

const response = (posts) => ({
  posts,
  total: posts.length,
  page: 1,
  limit: 10,
  has_more: false,
});

describe("transient post success", () => {
  test("decorates a refreshed server post without moving it", () => {
    const refreshed = response([post("first"), post("created"), post("third")]);
    const result = mergeRefreshedPostPreservingOrder(
      refreshed,
      post("created", "success"),
      true,
      false,
    );
    expect(result.posts.map((item) => item.post_id)).toEqual(["first", "created", "third"]);
    expect(result.posts[1].optimistic_status).toBe("success");
  });

  test("does not pin a fallback after success expires", () => {
    const refreshed = response([post("first"), post("third")]);
    const result = mergeRefreshedPostPreservingOrder(
      refreshed,
      post("created", "success"),
      false,
      false,
    );
    expect(result).toBe(refreshed);
  });

  test("keeps an active processing fallback independently of success", () => {
    const refreshed = response([post("first")]);
    const processing = post("created");
    processing.optimistic_video_preview_until = Date.now() + 45_000;
    const result = mergeRefreshedPostPreservingOrder(refreshed, processing, false, true);
    expect(result.posts[0]).toBe(processing);
    expect(result.posts[0].optimistic_status).toBeUndefined();
  });

  test("clears success without changing processing metadata", () => {
    const processing = post("created", "success");
    processing.optimistic_video_preview_until = 123;
    const data = { pages: [response([processing])], pageParams: [1] };
    const result = setTransientPostSuccessInData(data, "created", false);
    expect(result.pages[0].posts[0].optimistic_status).toBeUndefined();
    expect(result.pages[0].posts[0].optimistic_video_preview_until).toBe(123);
  });

  test("detects success so it can be excluded from persisted query data", () => {
    expect(hasTransientPostSuccess({ pages: [response([post("created", "success")])] }))
      .toBe(true);
    expect(hasTransientPostSuccess({ pages: [response([post("created")])] }))
      .toBe(false);
  });

  test("video readiness clears processing without cancelling active success", () => {
    const video = post("created", "success");
    video.optimistic_draft = { attachmentType: "video" };
    video.optimistic_video_preview_until = Date.now() + 45_000;
    const confirmed = { pages: [response([video])], pageParams: [1] };

    const afterLocalReady = clearOptimisticVideoProcessingFromData(confirmed, "created");
    expect(afterLocalReady.pages[0].posts[0].optimistic_video_preview_until).toBeUndefined();
    expect(afterLocalReady.pages[0].posts[0].optimistic_status).toBe("success");

    const afterSuccessWindow = setTransientPostSuccessInData(
      afterLocalReady,
      "created",
      false,
    );
    expect(afterSuccessWindow.pages[0].posts[0].optimistic_status).toBeUndefined();
  });
});
