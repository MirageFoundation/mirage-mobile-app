import { Feather } from "@expo/vector-icons";
import type { Dispatch, SetStateAction } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useDraftStore } from "@/src/stores/draft-store";

import { IMAGE_UPLOADS } from "./create-upload-state";
import { styles } from "./create-screen-styles";

type ImageUploadState = Record<
  string,
  { progress: number; uploading: boolean; done: boolean; error: string | null }
>;

type CreateImagePreviewCarouselProps = {
  imageUploadState: ImageUploadState;
  setImageUploadState: Dispatch<SetStateAction<ImageUploadState>>;
  isNetworkOnline: boolean;
  editExpired: boolean;
  onRetryUpload: (uri: string) => void;
};

export function CreateImagePreviewCarousel({
  imageUploadState,
  setImageUploadState,
  isNetworkOnline,
  editExpired,
  onRetryUpload,
}: CreateImagePreviewCarouselProps) {
  const attachmentType = useDraftStore((state) => state.draft.attachmentType);
  const mediaUris = useDraftStore((state) => state.draft.mediaUris);
  const visible = attachmentType === "image";

  const handleRemoveImage = (uri: string) => {
    triggerHaptic("selection");
    useDraftStore.getState().removeMediaUri(uri);
    IMAGE_UPLOADS.delete(uri);
    setImageUploadState((prev) => {
      const next = { ...prev };
      delete next[uri];
      return next;
    });
  };

  if (!visible || mediaUris.length === 0) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.videoPreviewContainer}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      >
        {mediaUris.map((uri) => {
          const upload = imageUploadState[uri];
          const needsUpload = !upload;
          return (
            <View key={uri} style={[styles.videoPlayerWrapper, { height: 200, width: 200 }]}>
              <Image
                source={{ uri }}
                style={[styles.videoPlayer, { resizeMode: "cover" }]}
              />
              <View style={styles.mediaTypeBadge}>
                <Feather name="image" size={12} color="#fff" />
              </View>

              {upload?.uploading && (
                <View style={[styles.uploadedBadge, !isNetworkOnline && { backgroundColor: "rgba(234,179,8,0.85)" }]}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text size="xs" weight="medium" style={{ color: "#fff", marginLeft: 4 }}>
                    {!isNetworkOnline
                      ? "Low connectivity…"
                      : `Uploading… ${Math.round(upload.progress)}%`}
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

              {needsUpload && (
                <Pressable
                  onPress={() => onRetryUpload(uri)}
                  style={[styles.uploadedBadge, { backgroundColor: "rgba(234,179,8,0.9)" }]}
                >
                  <Feather name="refresh-cw" size={12} color="#fff" />
                  <Text size="xs" weight="medium" style={{ color: "#fff", marginLeft: 4 }}>
                    Upload again
                  </Text>
                </Pressable>
              )}

              {upload?.error && (
                <Pressable
                  onPress={() => onRetryUpload(uri)}
                  style={[styles.uploadedBadge, { backgroundColor: "rgba(220,50,50,0.8)" }]}
                >
                  <Feather name="refresh-cw" size={12} color="#fff" />
                  <Text size="xs" weight="medium" style={{ color: "#fff", marginLeft: 4 }}>
                    Upload failed · Retry
                  </Text>
                </Pressable>
              )}

              {!editExpired && (
                <Pressable
                  onPress={() => handleRemoveImage(uri)}
                  style={styles.videoRemoveButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <View style={styles.removeButtonInner}>
                    <Feather name="x" size={18} color="#fff" />
                  </View>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}
