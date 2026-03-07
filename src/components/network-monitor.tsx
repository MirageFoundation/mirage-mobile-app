import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useNetworkState } from "@/src/hooks/use-network-state";
import { useAppState } from "@/src/hooks/use-app-state";
import { Text } from "@/src/components/ui/primitives";

const SCREEN_WIDTH = Dimensions.get("window").width;
const TOAST_WIDTH = Math.round(SCREEN_WIDTH * 0.46);

export function NetworkMonitor() {
  const { isConnected } = useNetworkState();
  const { theme, rt } = useUnistyles();
  const insets = useSafeAreaInsets();
  const prevConnected = useRef(true);
  const isInitial = useRef(true);

  const [mode, setMode] = useState<"offline" | "online" | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;
  const dismissTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useAppState({ onForeground: () => {} });

  const animateIn = () => {
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
  };

  const animateOut = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.95,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsVisible(false);
      setMode(null);
    });
  };

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      prevConnected.current = isConnected;
      if (!isConnected) {
        setMode("offline");
        setIsVisible(true);
        animateIn();
      }
      return;
    }

    if (!isConnected && prevConnected.current) {
      if (dismissTimeout.current) {
        clearTimeout(dismissTimeout.current);
        dismissTimeout.current = null;
      }
      setMode("offline");
      setIsVisible(true);
      animateIn();
    }

    if (isConnected && !prevConnected.current) {
      setMode("online");
      animateIn();
      dismissTimeout.current = setTimeout(() => {
        animateOut();
      }, 2000);
    }

    prevConnected.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
    return () => {
      if (dismissTimeout.current) clearTimeout(dismissTimeout.current);
    };
  }, []);

  if (!isVisible) return null;

  const isDark = rt.themeName === "dark";
  const isOffline = mode === "offline";

  const iconColor = isOffline
    ? theme.colors.error[500]
    : theme.colors.success[500];
  const borderColor = isOffline
    ? theme.colors.error[500] + "40"
    : theme.colors.success[500] + "40";

  const ToastWrapper = Platform.OS === "ios" ? BlurView : View;
  const wrapperProps =
    Platform.OS === "ios"
      ? {
          intensity: 80,
          tint: isDark ? ("dark" as const) : ("light" as const),
          style: [styles.blurInner],
        }
      : {
          style: [
            styles.blurContainer,
            {
              backgroundColor: isDark
                ? "rgba(45, 48, 55, 0.92)"
                : "rgba(255, 255, 255, 0.92)",
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
      {Platform.OS === "ios" ? (
        <View style={[styles.borderWrap, { borderColor }]}>
          <ToastWrapper {...wrapperProps}>
            <View style={styles.content}>
              <View style={styles.iconContainer}>
                <Ionicons
                  name={isOffline ? "cloud-offline" : "cloud-done"}
                  size={14}
                  color={iconColor}
                />
              </View>
              <Text
                size="xs"
                weight="semibold"
                numberOfLines={1}
                style={styles.labelText}
              >
                {isOffline ? "No connection" : "Back online"}
              </Text>
            </View>
          </ToastWrapper>
        </View>
      ) : (
        <ToastWrapper {...wrapperProps}>
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <Ionicons
                name={isOffline ? "cloud-offline" : "cloud-done"}
                size={14}
                color={iconColor}
              />
            </View>
            <Text
              size="xs"
              weight="semibold"
              numberOfLines={1}
              style={styles.labelText}
            >
              {isOffline ? "No connection" : "Back online"}
            </Text>
          </View>
        </ToastWrapper>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
  },
  blurContainer: {
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
  },
  blurInner: {
    overflow: "hidden",
    borderRadius: 11,
  },
  borderWrap: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  iconContainer: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 5,
  },
  labelText: {
    fontSize: 11,
  },
}));
