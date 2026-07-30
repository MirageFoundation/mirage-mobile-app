import { Image } from "expo-image";
import { memo, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import type { ResolvedMedia } from "./post-card-utils";
import { Text } from "@/src/components/ui/primitives";
import { getMediaImagePolicy } from "./media-image-policy";
import {
  GALLERY_ASPECT_RATIO_CACHE,
  galleryStyles,
} from "./media-gallery-shared";

type GalleryImageItemProps = {
  item: ResolvedMedia;
  width: number;
  height: number;
  onPress?: () => void;
  onAspectRatioDetected?: (uri: string, ratio: number) => void;
  isPostDetail: boolean;
};

/** A single image/GIF inside a media gallery. */
export const GalleryImageItem = memo(function GalleryImageItem({
  item,
  width,
  height,
  onPress,
  onAspectRatioDetected,
  isPostDetail,
}: GalleryImageItemProps) {
  const [loaded, setLoaded] = useState(false);
  const imageLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imagePolicy = getMediaImagePolicy({
    uri: item.uri,
    surface: isPostDetail ? "detail" : "feed",
    mediaType: item.type === "gif" ? "gif" : "image",
    displayWidth: width,
  });

  useEffect(() => {
    imageLoadTimeoutRef.current = setTimeout(() => {
      setLoaded(true);
    }, 5000);
    return () => {
      if (imageLoadTimeoutRef.current) {
        clearTimeout(imageLoadTimeoutRef.current);
      }
    };
  }, [item.uri]);

  return (
    <Pressable onPress={onPress} style={[galleryStyles.itemContainer, { width, height }]}>
      <Image
        source={{ uri: imagePolicy.uri }}
        style={[galleryStyles.itemMedia, { width, height }]}
        contentFit={imagePolicy.contentFit}
        cachePolicy={imagePolicy.cachePolicy}
        recyclingKey={imagePolicy.recyclingKey}
        allowDownscaling={imagePolicy.allowDownscaling}
        enforceEarlyResizing={imagePolicy.enforceEarlyResizing}
        onLoad={({ source }) => {
          setLoaded(true);
          if (imageLoadTimeoutRef.current) clearTimeout(imageLoadTimeoutRef.current);
          const w = source?.width;
          const h = source?.height;
          if (w && h) {
            const ratio = w / h;
            if (Number.isFinite(ratio) && ratio > 0) {
              GALLERY_ASPECT_RATIO_CACHE.set(item.uri, ratio);
              onAspectRatioDetected?.(item.uri, ratio);
            }
          }
        }}
      />

      {!loaded && (
        <View style={galleryStyles.loadingOverlay}>
          <ActivityIndicator size="small" color="rgba(150,150,150,0.6)" />
        </View>
      )}

      <View style={galleryStyles.typeBadge}>
        <Text size="xs" weight="bold" style={{ color: "#fff" }}>
          {item.type === "gif" ? "GIF" : "IMG"}
        </Text>
      </View>
    </Pressable>
  );
});
