import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect } from "react";
import { Modal, Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { ConfettiAnimation } from "./quests-confetti";
import { BUTTON_GRADIENT_COLORS } from "./quests-ui-constants";

export function ClaimSuccessModal({
  visible,
  rewardAmount,
  inviteCodes,
  onClose,
}: {
  visible: boolean;
  rewardAmount: number;
  inviteCodes: number;
  onClose: () => void;
}) {
  const { theme } = useUnistyles();
  const scaleAnim = useSharedValue(0);
  const opacityAnim = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacityAnim.value = withTiming(1, { duration: 300 });
      scaleAnim.value = withSequence(
        withSpring(1.03, { damping: 15, stiffness: 300 }),
        withSpring(1, { damping: 15 }),
      );
    } else {
      opacityAnim.value = withTiming(0, { duration: 200 });
      scaleAnim.value = withTiming(0, { duration: 200 });
    }
  }, [opacityAnim, scaleAnim, visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: opacityAnim.value * 0.7,
  }));

  const modalStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
    opacity: opacityAnim.value,
  }));

  const handleClose = useCallback(() => {
    triggerHaptic("light");
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "#000",
            },
            backdropStyle,
          ]}
        />
        <ConfettiAnimation isVisible={visible} />
        <Animated.View
          style={[
            {
              backgroundColor: theme.colors.background.default,
              borderRadius: 24,
              padding: 32,
              alignItems: "center",
              marginHorizontal: 32,
              borderWidth: 1,
              borderColor: theme.colors.border.subtle,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 20,
              elevation: 10,
            },
            modalStyle,
          ]}
        >
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: theme.colors.success[500] + "20",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <Ionicons
              name="trophy"
              size={40}
              color={theme.colors.success[500]}
            />
          </View>

          <Text
            size="xl"
            weight="bold"
            style={{ marginBottom: 8, textAlign: "center" }}
          >
            Rewards Claimed!
          </Text>

          {rewardAmount > 0 && (
            <Box
              direction="row"
              alignItems="center"
              gap="xs"
              style={{ marginBottom: inviteCodes > 0 ? 8 : 24 }}
            >
              <Ionicons
                name="sparkles"
                size={20}
                color={theme.colors.warning[500]}
              />
              <Text
                size="lg"
                weight="bold"
                style={{ color: theme.colors.warning[500] }}
              >
                +{rewardAmount.toLocaleString()} MIRAGE
              </Text>
            </Box>
          )}

          {inviteCodes > 0 && (
            <Box
              direction="row"
              alignItems="center"
              gap="xs"
              style={{ marginBottom: 24 }}
            >
              <Ionicons
                name="mail-outline"
                size={20}
                color={theme.colors.primary[500]}
              />
              <Text
                size="lg"
                weight="bold"
                style={{ color: theme.colors.primary[500] }}
              >
                +{inviteCodes} Invite {inviteCodes === 1 ? "Code" : "Codes"}
              </Text>
            </Box>
          )}

          <Text
            size="sm"
            mode="subtle"
            style={{ textAlign: "center", marginBottom: 24 }}
          >
            Your rewards have been added to your balance
          </Text>

          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [
              {
                paddingHorizontal: 48,
                borderRadius: 12,
                overflow: "hidden",
              },
              { opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <LinearGradient
              colors={[...BUTTON_GRADIENT_COLORS]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 32,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
              }}
            >
              <Text size="md" weight="bold" style={{ color: "#fff" }}>
                Awesome!
              </Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}
