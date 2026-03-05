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
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import type { NewPostAvatar } from "@/src/hooks/use-new-posts-checker";

const GRADIENT_COLORS = ["rgb(102, 126, 234)", "rgb(118, 75, 162)"] as const;
const AVATAR_SIZE = 22;
const AVATAR_OVERLAP = 8;

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
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(-60);
  const opacity = useSharedValue(0);

  const top = topOffset ?? insets.top + 44;
  const displayAvatars = avatars.slice(0, 3);
  const showAvatars = newPostCount >= 3 && displayAvatars.length >= 3;

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 15, stiffness: 150 });
      opacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withSpring(-60, { damping: 15, stiffness: 150 });
      opacity.value = withTiming(0, { duration: 150 });
    }
  }, [visible]);

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
                    borderColor: theme.colors.primary[500],
                  },
                ]}
              >
                <Image
                  source={{
                    uri: `https://api.dicebear.com/9.x/identicon/png?seed=${avatar.username}&size=${AVATAR_SIZE * 2}`,
                  }}
                  style={styles.avatarImage}
                  cachePolicy="memory-disk"
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

const styles = StyleSheet.create((theme) => ({
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
    overflow: "hidden",
    backgroundColor: theme.colors.background.subtle,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
}));
