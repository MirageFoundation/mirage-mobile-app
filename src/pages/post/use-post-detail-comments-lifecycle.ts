import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router/react-navigation";
import type { QueryClient } from "@tanstack/react-query";

import { getComments } from "@/src/api/read/endpoints/posts";
import { queryKeys } from "@/src/api/read/query-keys";
import { useAppState } from "@/src/hooks";
import { useTimeTickStore } from "@/src/stores";

type RefetchComments = (silent?: boolean) => void;

type UsePostDetailCommentsLifecycleParams = {
  currentUserWallet?: string;
  id?: string;
  isFetchingComments: boolean;
  isPostNotFound: boolean;
  queryClient: QueryClient;
  refetchComments: () => unknown;
};

const COMMENTS_DEBOUNCE_MS = 2000;

export function usePostDetailCommentsLifecycle({
  currentUserWallet,
  id,
  isFetchingComments,
  isPostNotFound,
  queryClient,
  refetchComments,
}: UsePostDetailCommentsLifecycleParams) {
  const [screenActive, setScreenActive] = useState(true);
  const isScreenFocusedRef = useRef(true);
  const lastCommentsFetchRef = useRef<number>(0);
  const refetchCommentsRef = useRef<RefetchComments | null>(null);

  useAppState({
    onBackground: () => {
      setScreenActive(false);
    },
    onForeground: () => {
      setScreenActive(isScreenFocusedRef.current);
      refetchCommentsRef.current?.(true);
      useTimeTickStore.getState().bump();
    },
    staleThreshold: 0,
  });

  useFocusEffect(
    useCallback(() => {
      isScreenFocusedRef.current = true;
      setScreenActive(true);
      useTimeTickStore.getState().bump();
      refetchCommentsRef.current?.(true);
      return () => {
        isScreenFocusedRef.current = false;
        setScreenActive(false);
      };
    }, []),
  );

  useEffect(() => {
    if (isFetchingComments) lastCommentsFetchRef.current = Date.now();
  }, [isFetchingComments]);

  useEffect(() => {
    refetchCommentsRef.current = (silent?: boolean) => {
      if (isPostNotFound) return;
      if (silent) {
        if (!id) return;
        const now = Date.now();
        if (now - lastCommentsFetchRef.current < COMMENTS_DEBOUNCE_MS) return;
        lastCommentsFetchRef.current = now;
        getComments({ post_id: id, address: currentUserWallet })
          .then((data) => {
            queryClient.setQueryData(
              queryKeys.comments(id, currentUserWallet),
              data,
            );
          })
          .catch(() => {});
      } else {
        lastCommentsFetchRef.current = Date.now();
        refetchComments();
      }
    };
  }, [currentUserWallet, id, isPostNotFound, queryClient, refetchComments]);

  return {
    lastCommentsFetchRef,
    refetchCommentsRef,
    screenActive,
  };
}
