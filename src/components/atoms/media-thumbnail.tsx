import { useState, useRef } from "react";
import { View, Pressable, Animated, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

type MediaType = "image" | "video" | "gif";

type MediaThumbnailSize = "sm" | "md" | "lg" | "xl";

const SIZE_CONFIG: Record<MediaThumbnailSize, { size: number; iconSize: number; removeSize: number }> = {
  sm: { size: 60, iconSize: 20, removeSize: 18 },
  md: { size: 80, iconSize: 24, removeSize: 20 },
  lg: { size: 100, iconSize: 28, removeSize: 22 },
  xl: { size: 120, iconSize: 32, removeSize: 24 },
};

type MediaThumbnailProps = {
  /** URI of the media */
  uri: string;
  /** Type of media */
  type?: MediaType;
  /** Size preset */
  size?: MediaThumbnailSize;
  /** Custom width (overrides size) */
  width?: number;
  /** Custom height (overrides size) */
  height?: number;
  /** Whether the thumbnail is removable */
  removable?: boolean;
  /** Callback when remove is pressed */
  onRemove?: () => void;
  /** Callback when thumbnail is pressed */
  onPress?: () => void;
  /** Whether the media is selected */
  selected?: boolean;
  /** Aspect ratio for non-square thumbnails */
  aspectRatio?: number;
  /** Border radius preset */
  rounded?: "none" | "sm" | "md" | "lg";
};

export const MediaThumbnail = ({
  uri,
  type = "image",
  size = "md",
  width,
  height,
  removable = false,
  onRemove,
  onPress,
  selected = false,
  aspectRatio,
  rounded = "md",
}: MediaThumbnailProps) => {
  const { theme } = useUnistyles();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const { size: defaultSize, iconSize, removeSize } = SIZE_CONFIG[size];
  const resolvedWidth = width ?? defaultSize;
  const resolvedHeight = height ?? (aspectRatio ? resolvedWidth / aspectRatio : defaultSize);

  const handlePressIn = () => {
    if (!onPress) return;
    triggerHaptic("selection");
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const handleRemove = () => {
    triggerHaptic("light");
    onRemove?.();
  };

  const handleLoadEnd = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const getPlayIcon = (): keyof typeof Ionicons.glyphMap => {
    return type === "video" ? "play-circle" : "infinite";
  };

  styles.useVariants({ rounded, selected });

  return (
    <Animated.View style={[{ transform: [{ scale }] }]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        disabled={!onPress}
        style={[
          styles.container,
          { width: resolvedWidth, height: resolvedHeight },
        ]}
      >
        {/* Image */}
        {!hasError ? (
          <Image
            source={{ uri }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
            onLoadEnd={handleLoadEnd}
            onError={handleError}
          />
        ) : (
          <View style={styles.errorContainer}>
            <Ionicons 
              name="image-outline" 
              size={iconSize} 
              color={theme.colors.text.subtle} 
            />
            <Text size="xs" mode="subtle" style={{ marginTop: 4 }}>
              Failed
            </Text>
          </View>
        )}

        {/* Loading indicator */}
        {isLoading && !hasError && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color={theme.colors.text.subtle} />
          </View>
        )}

        {/* Video/GIF play overlay */}
        {(type === "video" || type === "gif") && !isLoading && !hasError && (
          <View style={styles.playOverlay}>
            <View style={styles.playButton}>
              <Ionicons 
                name={getPlayIcon()} 
                size={iconSize} 
                color="#fff" 
              />
            </View>
            {type === "gif" && (
              <View style={styles.gifBadge}>
                <Text size="xs" weight="bold" style={{ color: "#fff" }}>
                  GIF
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Remove button */}
        {removable && (
          <Pressable
            onPress={handleRemove}
            style={styles.removeButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View 
              style={[
                styles.removeButtonInner,
                { width: removeSize, height: removeSize },
              ]}
            >
              <Ionicons 
                name="close" 
                size={removeSize - 4} 
                color="#fff" 
              />
            </View>
          </Pressable>
        )}

        {/* Selection indicator */}
        {selected && (
          <View style={styles.selectedOverlay}>
            <Ionicons 
              name="checkmark-circle" 
              size={iconSize} 
              color={theme.colors.primary[500]} 
            />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    overflow: "hidden",
    backgroundColor: theme.colors.background.subtle,
    variants: {
      rounded: {
        none: { borderRadius: 0 },
        sm: { borderRadius: theme.radius.sm },
        md: { borderRadius: theme.radius.md },
        lg: { borderRadius: theme.radius.lg },
      },
      selected: {
        true: {
          borderWidth: 2,
          borderColor: theme.colors.primary[500],
        },
        false: {},
      },
    },
  },
  image: {
    width: "100%",
    height: "100%",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background.subtle,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  gifBadge: {
    position: "absolute",
    bottom: theme.spacing.xs,
    left: theme.spacing.xs,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
  },
  removeButton: {
    position: "absolute",
    top: theme.spacing.xs,
    right: theme.spacing.xs,
  },
  removeButtonInner: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
}));

