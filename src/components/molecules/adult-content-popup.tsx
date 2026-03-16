import { Box, Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type AdultContentPopupProps = {
  /** Whether the popup is visible */
  visible: boolean;
  /** Callback when user enables adult content */
  onEnable: () => void;
  /** Callback when user declines adult content */
  onDecline: () => void;
};

export const AdultContentPopup = ({
  visible,
  onEnable,
  onDecline,
}: AdultContentPopupProps) => {
  const { theme } = useUnistyles();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        bottomSheetRef.current?.present();
      }, isMounted ? 0 : 500);
      return () => clearTimeout(timer);
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [visible, isMounted]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.6}
        pressBehavior="none"
      />
    ),
    []
  );

  const handleEnable = useCallback(() => {
    triggerHaptic("success");
    onEnable();
  }, [onEnable]);

  const handleDecline = useCallback(() => {
    triggerHaptic("selection");
    onDecline();
  }, [onDecline]);

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      enablePanDownToClose={false}
      enableDynamicSizing
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: theme.colors.background.default,
      }}
      handleIndicatorStyle={{
        backgroundColor: theme.colors.border.default,
        width: 40,
      }}
    >
      <BottomSheetView style={styles.container}>
        {/* Icon */}
        <View style={styles.iconContainer}>
          <Ionicons
            name="eye-off"
            size={40}
            color={theme.colors.warning[500]}
          />
        </View>

        {/* Title */}
        <Text size="xl" weight="bold" style={{ textAlign: "center" }}>
          Adult Content
        </Text>

        {/* Description */}
        <Text
          size="sm"
          mode="subtle"
          style={{ textAlign: "center", marginTop: 12, lineHeight: 20 }}
        >
          Mirage is uncensored and includes adult content like pornography,
          violence, and other NSFW material. Would you like to see this content
          in your feed?
        </Text>

        {/* Buttons */}
        <Box gap="sm" style={{ marginTop: 24, width: "100%" }}>
          <Button size="lg" rounded="lg" onPress={handleEnable}>
            <Button.Text weight="semibold">Yes, show everything</Button.Text>
          </Button>

          <Button
            size="lg"
            variant="outline"
            rounded="lg"
            onPress={handleDecline}
            style={{
              backgroundColor: theme.colors.background.subtle,
              borderWidth: 0.5,
              borderColor: theme.colors.border.default,
            }}
          >
            <Button.Text weight="semibold">No, keep it clean</Button.Text>
          </Button>
        </Box>

        {/* Settings note */}
        <Text
          size="xs"
          mode="subtle"
          style={{ textAlign: "center", marginTop: 16, paddingBottom: 24 }}
        >
          You can change this anytime in settings.
        </Text>
      </BottomSheetView>
    </BottomSheetModal>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    alignItems: "center",
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${theme.colors.warning[500]}15`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
}));
