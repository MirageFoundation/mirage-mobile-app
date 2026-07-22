import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";

import {
  AdultContentPopup,
  FeedHeader,
  NewPostsButton,
  UpdateBanner,
} from "@/src/components/molecules";
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
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();

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
          borderBottomColor={getHomeHeaderBorderColor(
            controller.showModerationReminder,
            theme.colors.error[500],
          )}
        />

        <HomeTabbedFeed
          ref={controller.tabbedFeedRef}
          key={controller.shareServer}
          feedType="home"
          activeTabIndex={controller.feedTabIndex}
          ListHeaderExtra={controller.moderationReminderHeader}
          onNewPostsChange={controller.handleNewPostsChange}
        />

        <NewPostsButton
          visible={controller.hasNewPosts}
          onPress={controller.handleNewPostsPress}
          topOffset={insets.top + 44}
          avatars={controller.newPostAvatars}
          newPostCount={controller.newPostCount}
          loading={controller.isBannerLoading}
        />

        <UpdateBanner
          status={controller.easUpdate.status}
          onInstall={controller.easUpdate.install}
          onDismiss={controller.easUpdate.dismiss}
        />

        <AdultContentPopup
          visible={controller.showAdultPopup}
          onEnable={controller.enableAdultContent}
          onDecline={controller.declineAdultContent}
          onGoToSettings={controller.openSettings}
        />

        <PostActionOverlays controller={controller.postActions} />
      </Box>
    </FeedPostCardRuntimeProvider>
  );
}
