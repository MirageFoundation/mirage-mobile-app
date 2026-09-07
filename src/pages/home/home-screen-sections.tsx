import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAccountStatus, useUserStatus } from "@/src/api/read";
import {
  FeedHeader,
  NewPostsButton,
  UpdateBanner,
} from "@/src/components/molecules";
import { AccountStatusNotices } from "@/src/components/molecules/subscription";
import { Box } from "@/src/components/ui/primitives";
import { PostActionOverlays } from "../post/post-action-overlays";
import { FeedPostCardRuntimeProvider } from "./feed-post-card-runtime";
import { HomeTabbedFeed } from "./home-tabbed-feed";
import { getHomeHeaderBorderColor } from "./home-screen-state";
import { styles } from "./home-styles";
import type { useHomeScreenController } from "./use-home-screen-controller";

type HomeScreenSectionsProps = {
  controller: ReturnType<typeof useHomeScreenController>;
};

export function HomeScreenSections({ controller }: HomeScreenSectionsProps) {
  const insets = useSafeAreaInsets();
  const { data: userStatus } = useUserStatus();
  const { data: accountStatus } = useAccountStatus();

  return (
    <FeedPostCardRuntimeProvider config={controller.feedRuntimeConfig}>
      <Box flex background="base">
        <View style={[styles.statusBarBackground, { height: insets.top }]} />

        <FeedHeader
          title="Mirage"
          onMenuPress={controller.openSideMenu}
          onSearchPress={controller.openSearch}
          animatedStyle={controller.headerAnimatedStyle}
          feedType={controller.feedType}
          feedOptions={controller.feedOptions}
          onFeedTypeChange={controller.handleFeedTypeChange}
          borderBottomColor={getHomeHeaderBorderColor()}
        />

        <Box px="md">
          <AccountStatusNotices
            quota={null}
            renewal={accountStatus?.renewal_warning}
            effectivePaid={userStatus?.effective_paid}
            userLevel={userStatus?.user_level}
            showQuota={false}
            showRenewal
            compact
          />
        </Box>

        <HomeTabbedFeed
          ref={controller.tabbedFeedRef}
          key={controller.shareServer}
          feedType="home"
          activeTabIndex={controller.feedTabIndex}
          onNewPostsChange={controller.handleNewPostsChange}
        />

        <NewPostsButton
          visible={controller.hasNewPosts}
          onPress={controller.handleNewPostsPress}
          topOffset={insets.top + 44}
          avatars={controller.newPostAvatars}
          newPostCount={controller.newPostCount}
        />

        <UpdateBanner
          status={controller.easUpdate.status}
          onInstall={controller.easUpdate.install}
          onDismiss={controller.easUpdate.dismiss}
        />

        <PostActionOverlays controller={controller.postActions} />
      </Box>
    </FeedPostCardRuntimeProvider>
  );
}
