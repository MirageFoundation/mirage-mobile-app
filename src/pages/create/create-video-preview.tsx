import type { RefObject } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { StyleSheet } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";

type VideoUploadState = {
  progress: number;
  uploading: boolean;
  done: boolean;
  error: string | null;
};

type CreateVideoPreviewProps = {
  mediaUris: string[];
  scrollRef: RefObject<ScrollView | null>;
  videoUploadState: Record<string, VideoUploadState>;
  isNetworkOnline: boolean;
  editExpired: boolean;
  onEditVideo: (uri: string) => void;
  onRetryUpload: (uri: string) => void;
  onRemoveVideo: (uri: string) => void;
  onAddVideo: () => void;
};

const VIDEO_HEIGHT = 180;
const VIDEO_WIDTH = Math.round(VIDEO_HEIGHT * (16 / 9) * 0.6);

export function CreateVideoPreview({
  mediaUris,
  scrollRef,
  videoUploadState,
  isNetworkOnline,
  editExpired,
  onEditVideo,
  onRetryUpload,
  onRemoveVideo,
  onAddVideo,
}: CreateVideoPreviewProps) {
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
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {mediaUris.map((uri) => {
          const upload = videoUploadState[uri];

          return (
            <Pressable
              key={uri}
              onPress={() => onEditVideo(uri)}
              style={[
                styles.videoPlayerWrapper,
                { height: VIDEO_HEIGHT, width: VIDEO_WIDTH },
              ]}
            >
              <View pointerEvents="none">
                <Image
                  source={{ uri }}
                  style={[
                    styles.videoPlayer,
                    { width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
                  ]}
                  contentFit="cover"
                />
              </View>

              <View style={styles.mediaTypeBadge}>
                <Feather name="video" size={12} color="#fff" />
              </View>

              {upload?.uploading ? (
                <View
                  style={[
                    styles.uploadedBadge,
                    !isNetworkOnline && styles.warningBadge,
                  ]}
                >
                  <ActivityIndicator size="small" color="#fff" />
                  <Text size="xs" weight="medium" style={styles.badgeText}>
                    {isNetworkOnline ? "Uploading…" : "Low connectivity…"}
                  </Text>
                </View>
              ) : null}

              {upload && !upload.uploading && upload.done ? (
                <View style={styles.uploadedBadge}>
                  <Feather name="check" size={12} color="#fff" />
                  <Text size="xs" weight="medium" style={styles.badgeText}>
                    Uploaded
                  </Text>
                </View>
              ) : null}

              {upload?.error ? (
                <Pressable
                  onPress={() => onRetryUpload(uri)}
                  style={[styles.uploadedBadge, styles.errorBadge]}
                >
                  <Feather name="refresh-cw" size={12} color="#fff" />
                  <Text size="xs" weight="medium" style={styles.badgeText}>
                    Retry
                  </Text>
                </Pressable>
              ) : null}

              {!editExpired ? (
                <Pressable
                  onPress={() => onRemoveVideo(uri)}
                  style={styles.videoRemoveButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <View style={styles.removeButtonInner}>
                    <Feather name="x" size={18} color="#fff" />
                  </View>
                </Pressable>
              ) : null}
            </Pressable>
          );
        })}

        {mediaUris.length < 10 ? (
          <Pressable
            onPress={onAddVideo}
            style={[
              styles.videoPlayerWrapper,
              styles.addVideoCard,
              {
                height: VIDEO_HEIGHT,
                width: VIDEO_WIDTH * 0.5,
              },
            ]}
          >
            <Feather name="plus" size={32} color="rgba(255,255,255,0.5)" />
            <Text size="xs" style={styles.addVideoText}>
              Add video
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create(() => ({
  videoPreviewContainer: {
    marginTop: 12,
    borderRadius: 12,
    overflow: "hidden",
  },
  scrollContent: {
    gap: 8,
    paddingHorizontal: 16,
  },
  videoPlayerWrapper: {
    backgroundColor: "#000",
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  videoPlayer: {
    width: "100%",
    height: "100%",
  },
  mediaTypeBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 20,
  },
  uploadedBadge: {
    position: "absolute",
    bottom: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.9)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  warningBadge: {
    backgroundColor: "rgba(234,179,8,0.85)",
  },
  errorBadge: {
    backgroundColor: "rgba(220,50,50,0.8)",
  },
  badgeText: {
    color: "#fff",
    marginLeft: 4,
  },
  videoRemoveButton: {
    position: "absolute",
    top: 12,
    right: 12,
  },
  removeButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  addVideoCard: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderStyle: "dashed",
  },
  addVideoText: {
    color: "rgba(255,255,255,0.5)",
    marginTop: 4,
  },
}));
