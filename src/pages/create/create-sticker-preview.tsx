import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { useCreateComposeState } from "./create-compose-state";
import { styles } from "./create-screen-styles";

const MIN_LOADING_BADGE_MS = 700;
const LOAD_EVENT_FALLBACK_MS = 1800;

type CreateStickerPreviewProps = {
  editExpired: boolean;
};

export function CreateStickerPreview({
  editExpired,
}: CreateStickerPreviewProps) {
  const { theme } = useUnistyles();
  const selectedStickers = useCreateComposeState((state) => state.selectedStickers);
  const removeSticker = useCreateComposeState((state) => state.removeSticker);
  const [loadState, setLoadState] = useState<Record<string, "loading" | "loaded" | "error">>({});
  const [retryNonce, setRetryNonce] = useState<Record<string, number>>({});
  const loadingStartedAtRef = useRef<Record<string, number>>({});

  useEffect(() => {
    selectedStickers.forEach((url) => {
      loadingStartedAtRef.current[url] = Date.now();
      setLoadState((prev) => ({ ...prev, [url]: "loading" }));

      setTimeout(() => {
        setLoadState((prev) =>
          prev[url] === "loading" ? { ...prev, [url]: "loaded" } : prev,
        );
      }, LOAD_EVENT_FALLBACK_MS);
    });
  }, [selectedStickers]);

  const markStickerLoaded = (url: string) => {
    const elapsed = Date.now() - (loadingStartedAtRef.current[url] ?? Date.now());
    const delay = Math.max(0, MIN_LOADING_BADGE_MS - elapsed);
    setTimeout(() => {
      setLoadState((prev) =>
        prev[url] === "error" ? prev : { ...prev, [url]: "loaded" },
      );
    }, delay);
  };

  const retrySticker = (url: string) => {
    loadingStartedAtRef.current[url] = Date.now();
    setLoadState((prev) => ({ ...prev, [url]: "loading" }));
    setRetryNonce((prev) => ({ ...prev, [url]: Date.now() }));
    setTimeout(() => {
      setLoadState((prev) =>
        prev[url] === "loading" ? { ...prev, [url]: "loaded" } : prev,
      );
    }, LOAD_EVENT_FALLBACK_MS);
  };

  if (selectedStickers.length === 0) return null;

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
        {selectedStickers.map((url) => {
          const state = loadState[url] ?? "loading";
          return (
            <View
              key={url}
              style={[
                styles.videoPlayerWrapper,
                { height: 140, width: 140, backgroundColor: theme.colors.background.subtle },
              ]}
            >
              <Image
                key={`${url}:${retryNonce[url] ?? 0}`}
                source={{ uri: url }}
                style={[styles.videoPlayer, { resizeMode: "contain" }]}
                onLoadStart={() => {
                  loadingStartedAtRef.current[url] = Date.now();
                  setLoadState((prev) => ({ ...prev, [url]: "loading" }));
                }}
                onLoad={() => markStickerLoaded(url)}
                onError={() => setLoadState((prev) => ({ ...prev, [url]: "error" }))}
              />
              <View style={styles.mediaTypeBadge}>
                <Feather name="smile" size={12} color="#fff" />
              </View>

              {state === "loading" && (
                <View style={styles.uploadedBadge}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text size="xs" weight="medium" style={{ color: "#fff", marginLeft: 4 }}>
                    Uploading…
                  </Text>
                </View>
              )}

              {state === "loaded" && (
                <View style={styles.uploadedBadge}>
                  <Feather name="check" size={12} color="#fff" />
                  <Text size="xs" weight="medium" style={{ color: "#fff", marginLeft: 4 }}>
                    Uploaded
                  </Text>
                </View>
              )}

              {state === "error" && (
                <Pressable
                  onPress={() => retrySticker(url)}
                  style={[styles.uploadedBadge, { backgroundColor: "rgba(234,179,8,0.9)" }]}
                >
                  <Feather name="refresh-cw" size={12} color="#fff" />
                  <Text size="xs" weight="medium" style={{ color: "#fff", marginLeft: 4 }}>
                    Upload again
                  </Text>
                </Pressable>
              )}

              {!editExpired && (
                <Pressable
                  onPress={() => removeSticker(url)}
                  style={[styles.videoRemoveButton, { top: 4, right: 4 }]}
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
