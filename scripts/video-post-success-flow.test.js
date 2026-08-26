import { describe, expect, test } from "bun:test";

import {
  mergePendingPostWithCachedPost,
  mergeRefreshedPostPreservingOrder,
  setTransientPostSuccessInResponse,
} from "../src/api/cache/transient-post-success";
import { transformOptimisticPostState } from "../src/api/read/utils/transform-optimistic-post-state";
import {
  isSuccessfulOptimisticPost,
  resolveOptimisticVideoPreviewMedia,
} from "../src/components/molecules/post-card-utils";
import { isPostVideoProcessing } from "../src/domain/posts/video-processing";
import { normalizePendingPost } from "../src/stores/pending-posts-lifecycle";

const confirmedVideoPost = {
  post_id: "confirmed-video-id",
  user_id: "mirage1author",
  username: "author",
  title: "Video post",
  content: "",
  topic: "videos",
  media: ["file:///local-preview.mp4"],
  timestamp: 1_700_000_000,
  comments: 0,
  points: 0,
  optimistic_status: "success",
  optimistic_draft: { attachmentType: "video" },
  optimistic_video_preview_until: Date.now() + 45_000,
};

const indexedVideoPost = {
  ...confirmedVideoPost,
  media: ["https://video.example.com/confirmed-video-id/playlist.m3u8"],
  thumbnail: "https://video.example.com/confirmed-video-id/thumbnail.jpg",
  media_meta: [{
    w: 1920,
    h: 1080,
    posterUrl: "https://video.example.com/confirmed-video-id/thumbnail.jpg",
  }],
  optimistic_status: undefined,
  optimistic_draft: undefined,
  optimistic_video_preview_until: undefined,
};

const confirmedImagePost = {
  ...confirmedVideoPost,
  post_id: "confirmed-image-id",
  title: "Image post",
  media: ["https://example.com/image.jpg"],
  optimistic_draft: { attachmentType: "image" },
  optimistic_video_preview_until: undefined,
};

const emptyResponse = () => ({
  posts: [],
  total: 0,
  page: 1,
  limit: 10,
  has_more: false,
});

describe("confirmed video post success flow", () => {
  test("reproduces the image/video asymmetry at pending-store normalization", () => {
    const pendingImagePost = normalizePendingPost(confirmedImagePost);
    const pendingVideoPost = normalizePendingPost(confirmedVideoPost);

    expect(pendingImagePost).toBeNull();
    expect(pendingVideoPost).not.toBeNull();
    expect(pendingVideoPost?.optimistic_status).toBeUndefined();

    const renderedImagePost = transformOptimisticPostState(confirmedImagePost);
    const renderedVideoBeforeReconciliation = transformOptimisticPostState(pendingVideoPost);
    expect(isSuccessfulOptimisticPost(renderedImagePost)).toBe(true);
    expect(isSuccessfulOptimisticPost(renderedVideoBeforeReconciliation)).toBe(false);
  });

  test("survives processing-store normalization, refresh, UI mapping, and banner predicate", () => {
    const pendingProcessingPost = normalizePendingPost(confirmedVideoPost);
    expect(pendingProcessingPost?.optimistic_status).toBeUndefined();
    expect(isPostVideoProcessing(pendingProcessingPost)).toBe(true);

    const refreshed = mergeRefreshedPostPreservingOrder(
      emptyResponse(),
      pendingProcessingPost,
      true,
      true,
    );
    expect(refreshed.posts[0]?.optimistic_status).toBe("success");

    const selectedApiPost = mergePendingPostWithCachedPost(
      pendingProcessingPost,
      refreshed.posts[0],
    );
    const renderedPost = transformOptimisticPostState(selectedApiPost);
    expect(renderedPost.optimisticStatus).toBe("success");
    expect(isPostVideoProcessing(renderedPost)).toBe(true);
    expect(isSuccessfulOptimisticPost(renderedPost)).toBe(true);

    const afterTimer = setTransientPostSuccessInResponse(
      refreshed,
      confirmedVideoPost.post_id,
      false,
    );
    const renderedAfterTimer = transformOptimisticPostState(
      mergePendingPostWithCachedPost(pendingProcessingPost, afterTimer.posts[0]),
    );
    expect(renderedAfterTimer.optimisticStatus).toBeUndefined();
    expect(isPostVideoProcessing(renderedAfterTimer)).toBe(true);
    expect(isSuccessfulOptimisticPost(renderedAfterTimer)).toBe(false);
  });

  test("replaces the local preview with indexed server media while retaining processing state", () => {
    const pendingProcessingPost = normalizePendingPost(confirmedVideoPost);
    const refreshed = mergeRefreshedPostPreservingOrder(
      { ...emptyResponse(), posts: [indexedVideoPost], total: 1 },
      pendingProcessingPost,
      false,
      true,
    );

    expect(refreshed.posts[0].media).toEqual(indexedVideoPost.media);
    expect(refreshed.posts[0].thumbnail).toBe(indexedVideoPost.thumbnail);
    expect(refreshed.posts[0].media_meta).toEqual(indexedVideoPost.media_meta);
    expect(refreshed.posts[0].optimistic_video_preview_until).toBe(
      pendingProcessingPost.optimistic_video_preview_until,
    );

    const selectedApiPost = mergePendingPostWithCachedPost(
      pendingProcessingPost,
      refreshed.posts[0],
    );
    expect(selectedApiPost.media).toEqual(indexedVideoPost.media);
    expect(selectedApiPost.thumbnail).toBe(indexedVideoPost.thumbnail);
    expect(isPostVideoProcessing(selectedApiPost)).toBe(true);
  });

  test("renders the local creator preview without replacing the hosted readiness target", () => {
    const hostedMedia = {
      uri: indexedVideoPost.media[0],
      type: "video",
      posterUri: indexedVideoPost.thumbnail,
    };
    const previewMedia = resolveOptimisticVideoPreviewMedia(
      hostedMedia,
      confirmedVideoPost.media[0],
      true,
    );

    expect(previewMedia.uri).toBe("file:///local-preview.mp4");
    expect(previewMedia.posterUri).toBeUndefined();
    expect(hostedMedia.uri).toBe(
      "https://video.example.com/confirmed-video-id/playlist.m3u8",
    );
  });

});
