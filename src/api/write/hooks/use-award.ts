import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useWallet } from "@/src/hooks/use-wallet";
import { queryKeys } from "@/src/api/read/query-keys";
import { giveAward, type GiveAwardInput } from "../endpoints/award";
import type {
  Post,
  PostsResponse,
  PostWithChildren,
  CommentsResponse,
  AwardBadge,
} from "@/src/api/types";

function addAwardToList(
  awards: AwardBadge[] | undefined,
  awardType: string
): AwardBadge[] {
  const current = awards ?? [];
  const existing = current.find((a) => a.type === awardType);
  if (existing) {
    return current.map((a) =>
      a.type === awardType ? { ...a, count: a.count + 1 } : a
    );
  }
  return [...current, { type: awardType, count: 1 }];
}

function updatePostAwards(post: Post, target: string, awardType: string): Post {
  if (post.post_id !== target) return post;
  return { ...post, awards: addAwardToList(post.awards, awardType) };
}

function updateCommentTreeAwards(
  comment: PostWithChildren,
  target: string,
  awardType: string
): PostWithChildren {
  if (comment.post_id === target) {
    return {
      ...comment,
      awards: addAwardToList(comment.awards, awardType),
      children: comment.children?.map((c) =>
        updateCommentTreeAwards(c, target, awardType)
      ),
    };
  }
  if (comment.children?.length) {
    return {
      ...comment,
      children: comment.children.map((c) =>
        updateCommentTreeAwards(c, target, awardType)
      ),
    };
  }
  return comment;
}

export function useGiveAward() {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationFn: async (input: GiveAwardInput) => {
      const wallet = await getWallet();
      return giveAward(wallet, input);
    },
    onMutate: async ({ target, award_type }) => {
      await queryClient.cancelQueries({ queryKey: ["posts"] });
      await queryClient.cancelQueries({ queryKey: ["comments"] });

      const previousPosts = queryClient.getQueriesData({ queryKey: ["posts"] });
      const previousComments = queryClient.getQueriesData({ queryKey: ["comments"] });

      for (const [key, data] of previousPosts) {
        if (!data) continue;

        const infiniteData = data as InfiniteData<PostsResponse>;
        if (infiniteData.pages) {
          queryClient.setQueryData(key, {
            ...infiniteData,
            pages: infiniteData.pages.map((page) => ({
              ...page,
              posts: page.posts.map((p) => updatePostAwards(p, target, award_type)),
            })),
          });
          continue;
        }

        const singleData = data as PostsResponse;
        if (singleData.posts) {
          queryClient.setQueryData(key, {
            ...singleData,
            posts: singleData.posts.map((p) => updatePostAwards(p, target, award_type)),
          });
        }
      }

      for (const [key, data] of previousComments) {
        if (!data) continue;
        const commentsData = data as CommentsResponse;
        if (!commentsData.root) continue;

        queryClient.setQueryData(key, {
          ...commentsData,
          root: updateCommentTreeAwards(commentsData.root, target, award_type),
          children: commentsData.children?.map((c) =>
            updateCommentTreeAwards(c, target, award_type)
          ),
        });
      }

      return { previousPosts, previousComments };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousPosts) {
        for (const [key, data] of context.previousPosts) {
          queryClient.setQueryData(key, data);
        }
      }
      if (context?.previousComments) {
        for (const [key, data] of context.previousComments) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["posts"],
        refetchType: "none",
      });
      queryClient.invalidateQueries({
        queryKey: ["comments"],
        refetchType: "none",
      });
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userStatus(address),
          refetchType: "none",
        });
      }
    },
  });
}
