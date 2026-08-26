import { Feather } from "@expo/vector-icons";
import { Button, Icon } from "@/primitives";
import { StyleSheet } from "react-native-unistyles";
import { useCallback } from "react";
import Animated, {
  withTiming,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
} from "react-native-reanimated";
import { useTheme } from "@/providers/theme-context";

const ThemeSwitcher = () => {
  const { currentTheme, setThemeMode } = useTheme();
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);

  const handleChangeTheme = useCallback(() => {
    // Toggle to opposite of current resolved theme
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    setThemeMode(newTheme);

    // Single smooth rotation animation
    rotation.value = withTiming(rotation.value + 360, {
      duration: 400,
    });

    // Quicker, smoother scale animation
    scale.value = withSequence(
      withTiming(0.85, { duration: 100 }),
      withTiming(1.1, { duration: 100 }),
      withTiming(1, { duration: 100 }),
    );
  }, [currentTheme, setThemeMode, rotation, scale]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotation.value}deg` }, { scale: scale.value }],
    };
  });

  return (
    <Button
      variant="ghost"
      onPress={handleChangeTheme}
      style={styles.themeSwitcher}
    >
      <Button.Icon>
        <Animated.View style={animatedStyle}>
          <Icon
            icon={Feather}
            name={currentTheme === "dark" ? "moon" : "sun"}
            size={27}
          />
        </Animated.View>
      </Button.Icon>
    </Button>
  );
};

export default ThemeSwitcher;

const styles = StyleSheet.create((theme) => ({
  themeSwitcher: {
    paddingHorizontal: 0,
    width: 38,
    height: 38,
    marginRight: theme.spacing.sm,
  },
}));
