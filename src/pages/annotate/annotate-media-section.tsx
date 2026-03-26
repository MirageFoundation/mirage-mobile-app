import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { Image, Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { Text } from "@/src/components/ui/primitives";

import { AnnotateToggle } from "./annotate-toggle";

type MediaType = "image" | "sticker" | "video" | null;

type VideoUploadState = Record<
  string,
  { progress: number; uploading: boolean; done: boolean; error: string | null }
>;

export function AnnotateMediaSection({
  enabled,
  mediaType,
  mediaUris,
  selectedStickers,
  subtleTextColor,
  textColor,
  backgroundLight,
  borderColor,
  isNetworkOnline,
  onEditVideo,
  onImagePress,
  onRemoveMedia,
  onRemoveSticker,
  onRemoveVideo,
  onStickerPress,
  onToggle,
  onVideoPress,
  startVideoUpload,
  videoHeight,
  videoUploadState,
  videoWidth,
}: {
  enabled: boolean;
  mediaType: MediaType;
  mediaUris: string[];
  selectedStickers: string[];
  subtleTextColor: string;
  textColor: string;
  backgroundLight: string;
  borderColor: string;
  isNetworkOnline: boolean;
  onEditVideo: (uri: string) => void;
  onImagePress: () => void;
  onRemoveMedia: (uri: string) => void;
  onRemoveSticker: (url: string) => void;
  onRemoveVideo: (uri: string) => void;
  onStickerPress: () => void;
  onToggle: () => void;
  onVideoPress: () => void;
  startVideoUpload: (uri: string) => void;
  videoHeight: number;
  videoUploadState: VideoUploadState;
  videoWidth: number;
}) {
  return (
    <AnnotateToggle
      label="Media"
      enabled={enabled}
      onToggle={onToggle}
      subtleColor={subtleTextColor}
    >
      {mediaType === "image" && mediaUris.length > 0 ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          style={styles.mediaPreviewScroll}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {mediaUris.map((uri) => (
              <View key={uri} style={[styles.mediaThumb, { backgroundColor: backgroundLight }]}> 
                <Image source={{ uri }} style={styles.mediaThumbImage} />
                <Pressable onPress={() => onRemoveMedia(uri)} style={styles.mediaRemoveBtn} hitSlop={10}>
                  <View style={styles.mediaRemoveBtnInner}>
                    <Feather name="x" size={14} color="#fff" />
                  </View>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}

      {mediaType === "video" && mediaUris.length > 0 ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          style={styles.videoPreviewContainer}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {mediaUris.map((uri) => {
              const upload = videoUploadState[uri];
              return (
                <Pressable
                  key={uri}
                  onPress={() => onEditVideo(uri)}
                  style={[styles.videoPlayerWrapper, { height: videoHeight, width: videoWidth }]}
                >
                  <View pointerEvents="none">
                    <Image
                      source={{ uri }}
                      style={[styles.videoPlayer, { width: videoWidth, height: videoHeight, resizeMode: "cover" }]}
                    />
                  </View>

                  <View style={styles.mediaTypeBadge}>
                    <Feather name="video" size={12} color="#fff" />
                  </View>

                  {upload?.uploading ? (
                    <View style={[styles.uploadedBadge, !isNetworkOnline && { backgroundColor: "rgba(234,179,8,0.85)" }]}>
                      <Text size="xs" weight="medium" style={{ color: "#fff" }}>
                        {isNetworkOnline ? "Uploading…" : "Low connectivity…"}
                      </Text>
                    </View>
                  ) : null}

                  {upload && !upload.uploading && upload.done ? (
                    <View style={styles.uploadedBadge}>
                      <Feather name="check" size={12} color="#fff" />
                      <Text size="xs" weight="medium" style={{ color: "#fff", marginLeft: 4 }}>
                        Uploaded
                      </Text>
                    </View>
                  ) : null}

                  {upload?.error ? (
                    <Pressable
                      onPress={() => startVideoUpload(uri)}
                      style={[styles.uploadedBadge, { backgroundColor: "rgba(220,50,50,0.8)" }]}
                    >
                      <Feather name="refresh-cw" size={12} color="#fff" />
                      <Text size="xs" weight="medium" style={{ color: "#fff", marginLeft: 4 }}>
                        Retry
                      </Text>
                    </Pressable>
                  ) : null}

                  <Pressable onPress={() => onRemoveVideo(uri)} style={styles.videoRemoveButton}>
                    <View style={styles.removeButtonInner}>
                      <Feather name="x" size={18} color="#fff" />
                    </View>
                  </Pressable>
                </Pressable>
              );
            })}

            {mediaUris.length < 10 ? (
              <Pressable
                onPress={onVideoPress}
                style={[
                  styles.videoPlayerWrapper,
                  {
                    height: videoHeight,
                    width: videoWidth * 0.5,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.2)",
                    borderStyle: "dashed",
                  },
                ]}
              >
                <Feather name="plus" size={32} color="rgba(255,255,255,0.5)" />
                <Text size="xs" style={{ color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                  Add video
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </Animated.View>
      ) : null}

      {selectedStickers.length > 0 ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          style={styles.mediaPreviewScroll}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {selectedStickers.map((url) => (
              <View key={url} style={[styles.mediaThumb, { backgroundColor: backgroundLight }]}> 
                <ExpoImage
                  source={{ uri: url }}
                  style={[styles.mediaThumbImage, { resizeMode: "contain" }]}
                />
                <Pressable onPress={() => onRemoveSticker(url)} style={styles.mediaRemoveBtn} hitSlop={10}>
                  <View style={styles.mediaRemoveBtnInner}>
                    <Feather name="x" size={14} color="#fff" />
                  </View>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}

      <View style={styles.mediaToolbar}>
        <Pressable
          onPress={onImagePress}
          disabled={!!mediaType && mediaType !== "image"}
          style={[styles.mediaIconBtn, !!mediaType && mediaType !== "image" && styles.mediaIconDisabled]}
        >
          <Feather name="image" size={22} color={!!mediaType && mediaType !== "image" ? subtleTextColor : textColor} />
          <Text size="xs" style={{ color: !!mediaType && mediaType !== "image" ? subtleTextColor : textColor }}>
            Image
          </Text>
        </Pressable>

        <Pressable
          onPress={onVideoPress}
          disabled={!!mediaType && mediaType !== "video"}
          style={[styles.mediaIconBtn, !!mediaType && mediaType !== "video" && styles.mediaIconDisabled]}
        >
          <Feather name="video" size={22} color={!!mediaType && mediaType !== "video" ? subtleTextColor : textColor} />
          <Text size="xs" style={{ color: !!mediaType && mediaType !== "video" ? subtleTextColor : textColor }}>
            Video
          </Text>
        </Pressable>

        <Pressable
          onPress={onStickerPress}
          disabled={!!mediaType && mediaType !== "sticker"}
          style={[styles.mediaIconBtn, !!mediaType && mediaType !== "sticker" && styles.mediaIconDisabled]}
        >
          <MaterialCommunityIcons name="sticker-emoji" size={22} color={!!mediaType && mediaType !== "sticker" ? subtleTextColor : textColor} />
          <Text size="xs" style={{ color: !!mediaType && mediaType !== "sticker" ? subtleTextColor : textColor }}>
            Sticker
          </Text>
        </Pressable>
      </View>
    </AnnotateToggle>
  );
}

const styles = {
  mediaPreviewScroll: {
    marginBottom: 12,
  },
  mediaThumb: {
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: "hidden" as const,
  },
  mediaThumbImage: {
    width: "100%" as const,
    height: "100%" as const,
  },
  mediaRemoveBtn: {
    position: "absolute" as const,
    top: 6,
    right: 6,
  },
  mediaRemoveBtnInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  videoPreviewContainer: {
    marginBottom: 12,
  },
  videoPlayerWrapper: {
    borderRadius: 12,
    overflow: "hidden" as const,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  videoPlayer: {
    borderRadius: 12,
  },
  mediaTypeBadge: {
    position: "absolute" as const,
    top: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  uploadedBadge: {
    position: "absolute" as const,
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(34,197,94,0.85)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row" as const,
    alignItems: "center" as const,
  },
  videoRemoveButton: {
    position: "absolute" as const,
    top: 8,
    right: 8,
  },
  removeButtonInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  mediaToolbar: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    gap: 12,
  },
  mediaIconBtn: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 12,
    gap: 6,
  },
  mediaIconDisabled: {
    opacity: 0.4,
  },
};
