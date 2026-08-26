import { forwardRef } from "react";
import { ActivityIndicator, View } from "react-native";

import { Text } from "@/src/components/ui/primitives";
import { useRedgifsMedia } from "@/src/api/read/hooks/use-redgifs-media";
import { postMediaStyles as styles } from "./post-card-media-styles";
import { PostCardVideo, type PostCardVideoRef } from "./post-card-video";
import {
  getRedgifsId,
  type ResolvedMedia,
} from "./post-card-utils";

type PostCardRedgifsProps = {
  media: ResolvedMedia;
  isVisible: boolean;
  isFocused: boolean;
  isNearVisible?: boolean;
  isConnected: boolean;
  shouldBlurContent: boolean;
  allowAutoplay: boolean;
  screenActive: boolean;
  disabled: boolean;
  onRevealContent?: () => void;
  onMediaPress?: () => void;
  isPostDetail: boolean;
  videoSyncScope?: string;
  postId?: string;
};

export const PostCardRedgifs = forwardRef<PostCardVideoRef, PostCardRedgifsProps>(function PostCardRedgifs(
  {
    media,
    isVisible,
    isFocused,
    isNearVisible,
    isConnected,
    shouldBlurContent,
    allowAutoplay,
    screenActive,
    disabled,
    onRevealContent,
    onMediaPress,
    isPostDetail,
    videoSyncScope,
    postId,
  },
  ref,
) {
  const id = getRedgifsId(media.uri);
  const query = useRedgifsMedia(id);

  if (!query.data) {
    return (
      <View style={styles.mediaContainer}>
        <View style={[styles.mediaWrapper, { aspectRatio: media.aspectRatio ?? 16 / 9 }]}>
          <View style={[styles.media, { alignItems: "center", justifyContent: "center" }]}>
            {query.isError ? (
              <Text size="sm" mode="subtle">Unable to load Redgifs media</Text>
            ) : (
              <ActivityIndicator size="small" color="rgba(150,150,150,0.6)" />
            )}
          </View>
        </View>
      </View>
    );
  }

  const resolvedMedia: ResolvedMedia = {
    uri: query.data.videoUrl,
    type: "video",
    posterUri: query.data.posterUrl,
    width: query.data.width,
    height: query.data.height,
    aspectRatio:
      query.data.width && query.data.height
        ? query.data.width / query.data.height
        : media.aspectRatio,
  };

  return (
    <PostCardVideo
      ref={ref}
      media={resolvedMedia}
      isVisible={isVisible}
      isFocused={isFocused}
      isNearVisible={isNearVisible}
      isConnected={isConnected}
      shouldPrimeOptimisticVideo={false}
      shouldBlurContent={shouldBlurContent}
      hasMultipleMedia={false}
      extraMediaCount={0}
      allowAutoplay={allowAutoplay}
      screenActive={screenActive}
      disabled={disabled}
      onRevealContent={onRevealContent}
      onMediaPress={onMediaPress}
      isPostDetail={isPostDetail}
      videoSyncScope={videoSyncScope}
      postId={postId}
    />
  );
});
