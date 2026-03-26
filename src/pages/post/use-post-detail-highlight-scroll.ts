import { type Comment } from "@/src/components/molecules";
import { useCallback, useRef, useState } from "react";
import { FlatList } from "react-native";

import { findCommentInTree } from "./post-detail-comment-utils";

export function usePostDetailHighlightScroll(initialHighlight?: string | null) {
  const flatListRef = useRef<FlatList<Comment>>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(
    initialHighlight || null,
  );

  const scrollToHighlightedComment = useCallback(
    (comments: Comment[]) => {
      if (!highlightedCommentId || comments.length === 0 || !flatListRef.current) {
        return;
      }

      let index = comments.findIndex((comment) => comment.id === highlightedCommentId);

      if (index === -1) {
        index = comments.findIndex((comment) =>
          findCommentInTree(comment, highlightedCommentId),
        );
      }

      if (index !== -1) {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index,
            animated: true,
            viewPosition: 0.1,
          });
        }, 500);

        setTimeout(() => {
          setHighlightedCommentId(null);
        }, 3000);
      }
    },
    [highlightedCommentId],
  );

  const handleScrollToIndexFailed = useCallback(
    (index: number, averageItemLength: number) => {
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({
          offset: averageItemLength * index,
          animated: true,
        });
      }, 100);
    },
    [],
  );

  return {
    flatListRef,
    handleScrollToIndexFailed,
    highlightedCommentId,
    scrollToHighlightedComment,
  };
}
