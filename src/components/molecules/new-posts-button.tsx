import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import type { NewPostAvatar } from "@/src/hooks/use-new-posts-checker";

const GRADIENT_COLORS = ["rgb(102, 126, 234)", "rgb(118, 75, 162)"] as const;
const AVATAR_SIZE = 22;
const AVATAR_OVERLAP = 8;
// 20% inner halo around the identicon glyph — matches the Avatar atom
// `paddingRatio` default so the new-posts banner has the same visual
// language as every other identicon surface.
const AVATAR_PADDING = Math.round(AVATAR_SIZE * 0.2);

type NewPostsButtonProps = {
  visible: boolean;
  onPress: () => void;
  topOffset?: number;
  avatars?: NewPostAvatar[];
  newPostCount?: number;
  loading?: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const NewPostsButton = ({
  visible,
  onPress,
  topOffset,
  avatars = [],
  newPostCount = 0,
  loading = false,
}: NewPostsButtonProps) => {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(-60);
  const opacity = useSharedValue(0);

  const top = topOffset ?? insets.top + 44;
  const displayAvatars = avatars.slice(0, 3);
  const showAvatars = displayAvatars.length > 0;

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 15, stiffness: 150 });
      opacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withSpring(-60, { damping: 15, stiffness: 150 });
      opacity.value = withTiming(0, { duration: 150 });
    }
  }, [opacity, translateY, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const handlePress = () => {
    triggerHaptic("light");
    onPress();
  };

  const avatarStackWidth = showAvatars
    ? AVATAR_SIZE + (displayAvatars.length - 1) * (AVATAR_SIZE - AVATAR_OVERLAP)
    : 0;

  return (
    <AnimatedPressable
      onPress={handlePress}
      style={[
        styles.container,
        { top: top + 8 },
        animatedStyle,
      ]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <LinearGradient
        colors={GRADIENT_COLORS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="arrow-up" size={14} color="#fff" />
        )}
        {showAvatars && (
          <View style={[styles.avatarStack, { width: avatarStackWidth }]}>
            {displayAvatars.map((avatar, index) => (
              <View
                key={avatar.userId}
                style={[
                  styles.avatarWrapper,
                  {
                    left: index * (AVATAR_SIZE - AVATAR_OVERLAP),
                    zIndex: displayAvatars.length - index,
                  },
                ]}
              >
                <Image
                  source={{
                    // Seed with the bech32 address (userId) so the
                    // identicon is stable across username changes.
                    uri: `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(avatar.userId || "default")}&scale=100`,
                  }}
                  style={styles.avatarImage}
                  cachePolicy="memory-disk"
                  contentFit="contain"
                />
              </View>
            ))}
          </View>
        )}
        <Text size="sm" weight="semibold" style={styles.text}>
          New posts
        </Text>
      </LinearGradient>
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    position: "absolute",
    alignSelf: "center",
    borderRadius: theme.radius.full,
    zIndex: 99,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
    overflow: "hidden",
  },
  gradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
  },
  text: {
    color: "#fff",
  },
  avatarStack: {
    height: AVATAR_SIZE,
    position: "relative",
  },
  avatarWrapper: {
    position: "absolute",
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 1.5,
    // Light theme: white border so the avatar reads against the
    // purple gradient. Dark theme keeps the original light primary
    // border.
    borderColor:
      rt.themeName === "light" ? "#fff" : theme.colors.primary[500],
    overflow: "hidden",
    // Light theme: use a slightly darker halo so the identicon's
    // 20% padding reads against the (near-white) wrapper bg. Dark
    // theme keeps the original `background.subtle`.
    backgroundColor:
      rt.themeName === "light"
        ? theme.colors.background.emphasis
        : theme.colors.background.subtle,
    padding: AVATAR_PADDING,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "transparent",
  },
}));
