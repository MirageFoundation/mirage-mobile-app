import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Text } from "@/src/components/ui/primitives";
import type { EasUpdateStatus } from "@/src/hooks/use-eas-update";

type UpdateBannerProps = {
  status: EasUpdateStatus;
  onInstall: () => void;
  onDismiss: () => void;
};

export const UpdateBanner = ({
  status,
  onInstall,
  onDismiss,
}: UpdateBannerProps) => {
  const { theme, rt } = useUnistyles();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-50)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;

  const visible = status !== "idle";
  const isInstalling = status === "installing";
  const isError = status === "error";
  const isDark = rt.themeName === "dark";

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 12,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 12,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -50,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.95,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  const accentColor = isError
    ? theme.colors.error[500]
    : theme.colors.primary[500];

  const borderColor = accentColor + "40";

  const ToastWrapper = Platform.OS === "ios" ? BlurView : View;
  const wrapperProps =
    Platform.OS === "ios"
      ? {
          intensity: 80,
          tint: isDark ? ("dark" as const) : ("light" as const),
          style: [styles.blurContainer, { borderColor }],
        }
      : {
          style: [
            styles.blurContainer,
            {
              backgroundColor: isDark
                ? "rgba(45, 48, 55, 0.95)"
                : "rgba(255, 255, 255, 0.95)",
              borderColor,
              elevation: 8,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 8,
            },
          ],
        };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          top: insets.top + 4,
          transform: [{ translateY }, { scale }],
          opacity,
        },
      ]}
    >
      <Pressable onPress={isInstalling ? undefined : onInstall}>
        <ToastWrapper {...wrapperProps}>
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              {isInstalling ? (
                <ActivityIndicator size="small" color={accentColor} />
              ) : (
                <Ionicons
                  name={isError ? "alert-circle" : "cloud-download-outline"}
                  size={20}
                  color={accentColor}
                />
              )}
            </View>

            <View style={styles.textContainer}>
              <Text size="sm" weight="semibold" numberOfLines={1}>
                {isInstalling
                  ? "Installing update…"
                  : isError
                    ? "Update failed"
                    : "Update available"}
              </Text>
            </View>
          </View>
        </ToastWrapper>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    position: "absolute",
    left: 48,
    right: 48,
    zIndex: 9999,
  },
  blurContainer: {
    overflow: "hidden",
    borderRadius: 9999,
    borderWidth: 1,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 8,
  },
  iconContainer: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
  },
}));
