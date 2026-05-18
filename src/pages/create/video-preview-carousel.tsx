import { Feather } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import { useRef } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { styles } from "./create-screen-styles";

type VideoUploadState = Record<
  string,
  { progress: number; uploading: boolean; done: boolean; error: string | null }
>;

type VideoPreviewCarouselProps = {
  mediaUris: string[];
  videoUploadState: VideoUploadState;
  isNetworkOnline: boolean;
  editExpired: boolean;
  onEditVideo: (uri: string) => void;
  onRetryUpload: (uri: string) => void;
  onRemoveVideo: (uri: string) => void;
  onAddVideo: () => void;
};

const VIDEO_HEIGHT = 180;
const VIDEO_WIDTH = Math.round(VIDEO_HEIGHT * (16 / 9) * 0.6);

export function VideoPreviewCarousel({
  mediaUris,
  videoUploadState,
  isNetworkOnline,
  editExpired,
  onEditVideo,
  onRetryUpload,
  onRemoveVideo,
  onAddVideo,
}: VideoPreviewCarouselProps) {
  const { theme } = useUnistyles();
  const videoScrollRef = useRef<ScrollView>(null);

  if (mediaUris.length === 0) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.videoPreviewContainer}
    >
      <ScrollView
        ref={videoScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
        onContentSizeChange={() => videoScrollRef.current?.scrollToEnd({ animated: true })}
      >
        {mediaUris.map((uri) => {
          const upload = videoUploadState[uri];
          return (
            <Pressable
              key={uri}
              onPress={() => onEditVideo(uri)}
              style={[styles.videoPlayerWrapper, { height: VIDEO_HEIGHT, width: VIDEO_WIDTH }]}
            >
              <View pointerEvents="none">
                <Video
                  source={{ uri }}
                  style={[styles.videoPlayer, { width: VIDEO_WIDTH, height: VIDEO_HEIGHT }]}
                  resizeMode={ResizeMode.COVER}
                  shouldPlay={false}
                  isMuted
                  useNativeControls={false}
                />
              </View>

              <View style={styles.mediaTypeBadge}>
                <Feather name="video" size={12} color="#fff" />
              </View>

              {upload?.uploading && (
                <View
                  style={[
                    styles.uploadedBadge,
                    !isNetworkOnline && { backgroundColor: "rgba(234,179,8,0.85)" },
                  ]}
                >
                  <ActivityIndicator size="small" color="#fff" />
                  <Text size="xs" weight="medium" style={{ color: "#fff", marginLeft: 4 }}>
                    {!isNetworkOnline
                      ? "Low connectivity…"
                      : upload.progress >= 98
                        ? "Processing…"
                        : "Uploading…"}
                  </Text>
                </View>
              )}

              {upload && !upload.uploading && upload.done && (
                <View style={styles.uploadedBadge}>
                  <Feather name="check" size={12} color="#fff" />
                  <Text size="xs" weight="medium" style={{ color: "#fff", marginLeft: 4 }}>
                    Uploaded
                  </Text>
                </View>
              )}

              {upload?.error && (
                <Pressable
                  onPress={() => onRetryUpload(uri)}
                  style={[styles.uploadedBadge, { backgroundColor: "rgba(220,50,50,0.8)" }]}
                >
                  <Feather name="refresh-cw" size={12} color="#fff" />
                  <Text size="xs" weight="medium" style={{ color: "#fff", marginLeft: 4 }}>
                    Retry
                  </Text>
                </Pressable>
              )}

              {!editExpired && (
                <Pressable
                  onPress={() => onRemoveVideo(uri)}
                  style={styles.videoRemoveButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <View style={styles.removeButtonInner}>
                    <Feather name="x" size={18} color="#fff" />
                  </View>
                </Pressable>
              )}
            </Pressable>
          );
        })}

        {mediaUris.length < 10 && (
          <Pressable
            onPress={onAddVideo}
            style={[
              styles.videoPlayerWrapper,
              {
                height: VIDEO_HEIGHT,
                width: VIDEO_WIDTH * 0.5,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                backgroundColor: theme.colors.background.subtle,
                borderColor: theme.colors.border.default,
                borderStyle: "dashed",
              },
            ]}
          >
            <Feather name="plus" size={32} color={theme.colors.text.subtle} />
            <Text size="xs" style={{ color: theme.colors.text.subtle, marginTop: 4 }}>
              Add video
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </Animated.View>
  );
}
