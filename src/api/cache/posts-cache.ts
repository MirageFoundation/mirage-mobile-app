import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/src/api/read/query-keys";
import type {
  CommentsResponse,
  Post as ApiPost,
  PostsResponse,
} from "@/src/api/types";

type EditablePostPatch = {
  title: string;
  content: string;
  tag?: string;
  topic?: string;
  media?: string[];
  edited_at: number;
};

const ROOT_POST_METADATA_KEYS: (keyof ApiPost)[] = [
  "points",
  "comments",
  "user_vote",
  "user_weight",
  "edited_at",
  "awards",
  "agent_edited",
  "appendices",
];

function updatePostsCollection(
  posts: ApiPost[],
  postId: string,
  updater: (post: ApiPost) => ApiPost,
): { posts: ApiPost[]; changed: boolean } {
  let changed = false;
  const nextPosts = posts.map((post) => {
    if (post.post_id !== postId) {
      return post;
    }

    const nextPost = updater(post);
    changed = changed || nextPost !== post;
    return nextPost;
  });

  return { posts: changed ? nextPosts : posts, changed };
}

export function patchEditedPostAcrossCaches(
  queryClient: QueryClient,
  postId: string,
  patch: EditablePostPatch,
) {
  const updatePost = (post: ApiPost): ApiPost => ({
    ...post,
    title: patch.title,
    content: patch.content,
    tag: patch.tag ?? post.tag,
    topic: patch.topic ?? post.topic,
    media: patch.media && patch.media.length > 0 ? patch.media : post.media,
    edited_at: patch.edited_at,
  });

  queryClient
    .getQueriesData<InfiniteData<PostsResponse>>({
      queryKey: queryKeys.postsRoot(),
    })
    .forEach(([key]) => {
      queryClient.setQueryData<InfiniteData<PostsResponse>>(key, (old) => {
        if (!old?.pages) return old;

        let changed = false;
        const nextPages = old.pages.map((page) => {
          const updated = updatePostsCollection(page.posts, postId, updatePost);
          if (!updated.changed) return page;
          changed = true;
          return { ...page, posts: updated.posts };
        });

        return changed ? { ...old, pages: nextPages } : old;
      });
    });

  queryClient.getQueriesData({ queryKey: queryKeys.userPostsRoot() }).forEach(([key]) => {
    queryClient.setQueryData(key, (old: any) => {
      if (!old?.posts || !Array.isArray(old.posts)) return old;
      const updated = updatePostsCollection(old.posts, postId, updatePost);
      return updated.changed ? { ...old, posts: updated.posts } : old;
    });
  });

  queryClient
    .getQueriesData<CommentsResponse>({
      queryKey: queryKeys.commentsRoot(),
    })
    .forEach(([key]) => {
      queryClient.setQueryData<CommentsResponse>(key, (old) => {
        if (!old?.root || old.root.post_id !== postId) return old;
        return { ...old, root: updatePost(old.root) };
      });
    });
}

export function syncRootPostMetadataToFeedCaches(
  queryClient: QueryClient,
  rootPost: ApiPost,
) {
  queryClient.setQueriesData<InfiniteData<PostsResponse>>(
    { queryKey: queryKeys.postsRoot() },
    (old) => {
      if (!old?.pages) return old;

      let changed = false;
      const nextPages = old.pages.map((page) => {
        const index = page.posts.findIndex((post) => post.post_id === rootPost.post_id);
        if (index === -1) return page;

        const existing = page.posts[index];
        const metadataChanged = ROOT_POST_METADATA_KEYS.some(
          (key) => existing[key] !== rootPost[key],
        );
        if (!metadataChanged) return page;

        changed = true;
        const updated = { ...existing };
        for (const key of ROOT_POST_METADATA_KEYS) {
          (updated as any)[key] = rootPost[key];
        }

        const nextPosts = [...page.posts];
        nextPosts[index] = updated;
        return { ...page, posts: nextPosts };
      });

      return changed ? { ...old, pages: nextPages } : old;
    },
  );
}
