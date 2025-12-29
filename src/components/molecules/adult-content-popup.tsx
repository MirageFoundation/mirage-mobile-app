import { useCallback, useMemo, useRef, useEffect } from "react";
import { View } from "react-native";
import BottomSheet, { BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";
import { Box, Text, Button } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

type AdultContentPopupProps = {
  /** Whether the popup is visible */
  visible: boolean;
  /** Callback when user enables adult content */
  onEnable: () => void;
  /** Callback when user declines adult content */
  onDecline: () => void;
  /** Callback when popup is dismissed */
  onDismiss?: () => void;
};

export const AdultContentPopup = ({
  visible,
  onEnable,
  onDecline,
  onDismiss,
}: AdultContentPopupProps) => {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const { theme } = useUnistyles();

  const snapPoints = useMemo(() => ["45%"], []);

  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.expand();
    } else {
      bottomSheetRef.current?.close();
    }
  }, [visible]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        onDismiss?.();
      }
    },
    [onDismiss]
  );

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.6}
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
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: theme.colors.background.default,
      }}
      handleIndicatorStyle={{
        backgroundColor: theme.colors.border.default,
        width: 40,
      }}
    >
      <View style={styles.container}>
        {/* Icon */}
        <View style={styles.iconContainer}>
          <Ionicons
            name="warning"
            size={48}
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
          style={{ textAlign: "center", marginTop: 8 }}
        >
          Would you like to enable adult content in your feed?
        </Text>
        <Text
          size="xs"
          mode="subtle"
          style={{ textAlign: "center", marginTop: 4 }}
        >
          You can change this later in settings.
        </Text>

        {/* Buttons */}
        <Box gap="md" style={{ marginTop: 24 }}>
          <Button
            size="lg"
            rounded="lg"
            onPress={handleEnable}
          >
            <Button.Text weight="semibold">Yes, Enable</Button.Text>
          </Button>

          <Button
            size="lg"
            variant="outline"
            rounded="lg"
            onPress={handleDecline}
          >
            <Button.Text weight="semibold">No Thanks</Button.Text>
          </Button>
        </Box>
      </View>
    </BottomSheet>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    alignItems: "center",
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${theme.colors.warning[500]}15`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
}));

