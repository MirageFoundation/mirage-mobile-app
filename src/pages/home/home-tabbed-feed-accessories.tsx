import type { ReactNode } from "react";
import { useMemo } from "react";

import {
  PostCardSkeleton,
  PostCardSkeletonList,
  QuestsSummaryCard,
} from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";

type HeaderProps = {
  extra?: ReactNode;
  showQuests: boolean;
};

export function HomeFeedListHeader({ extra, showQuests }: HeaderProps) {
  return (
    <>
      {extra}
      {showQuests && <QuestsSummaryCard />}
    </>
  );
}

type EmptyProps = {
  feedType: "home" | "following";
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
};

export function HomeFeedListEmpty({
  feedType,
  isLoading,
  isError,
  errorMessage,
}: EmptyProps) {
  if (isLoading) return <PostCardSkeletonList count={5} />;

  if (isError) {
    return (
      <Box flex center p="lg" style={{ paddingTop: 100 }}>
        <Text size="lg" weight="medium" mode="subtle">
          Failed to load posts
        </Text>
        <Text
          size="sm"
          mode="subtle"
          style={{ marginTop: 8, textAlign: "center" }}
        >
          {errorMessage || "Something went wrong. Pull to refresh."}
        </Text>
      </Box>
    );
  }

  return (
    <Box flex center p="lg" style={{ paddingTop: 100 }}>
      <Text size="xxl" weight="medium" mode="subtle">
        {feedType === "following" ? "No posts available" : "No posts yet"}
      </Text>
      <Text
        size="md"
        mode="subtle"
        style={{ marginTop: 8, textAlign: "center" }}
      >
        {feedType === "following" ? (
          <>
            <Text size="md" weight="bold">
              Only posts from topics and people you follow.
            </Text>
            {" A focused view of your communities without discovery content."}
          </>
        ) : (
          "Be the first to share something interesting!"
        )}
      </Text>
    </Box>
  );
}

export function useHomeFeedListFooter(
  isFetchingNext: boolean,
  postCount: number,
) {
  return useMemo(() => {
    if (isFetchingNext && postCount > 0) {
      return <PostCardSkeleton showMedia={false} showBody />;
    }
    return <Box p="sm" />;
  }, [isFetchingNext, postCount]);
}
