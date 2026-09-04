import { Box, Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useRef } from "react";
import { BackHandler, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type AdultContentPopupProps = {
  visible: boolean;
  onEnable: () => void;
  onDecline: () => void;
  onGoToSettings?: () => void;
};

export const AdultContentPopup = ({
  visible,
  onEnable,
  onDecline,
  onGoToSettings,
}: AdultContentPopupProps) => {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const settledRef = useRef(false);
  const isAndroid = Platform.OS === "android";
  const bottomPadding = Math.max(insets.bottom, 24);

  useEffect(() => {
    if (!visible) {
      settledRef.current = false;
      bottomSheetRef.current?.dismiss();
      return;
    }
    settledRef.current = false;
    const frame = requestAnimationFrame(() => {
      bottomSheetRef.current?.present();
    });
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, [visible]);

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
    [],
  );

  const handleSheetDismiss = useCallback(() => {
    if (settledRef.current || !visible) return;
    bottomSheetRef.current?.present();
  }, [visible]);

  const complete = useCallback((action: () => void) => {
    settledRef.current = true;
    action();
  }, []);

  const handleEnable = useCallback(() => {
    triggerHaptic("success");
    complete(onEnable);
  }, [complete, onEnable]);

  const handleDecline = useCallback(() => {
    triggerHaptic("selection");
    complete(onDecline);
  }, [complete, onDecline]);

  const handleGoToSettings = useCallback(() => {
    triggerHaptic("selection");
    complete(() => {
      onDecline();
      onGoToSettings?.();
    });
  }, [complete, onDecline, onGoToSettings]);

  if (isAndroid) {
    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        enablePanDownToClose={false}
        enableHandlePanningGesture={false}
        enableContentPanningGesture={false}
        enableDynamicSizing
        backdropComponent={renderBackdrop}
        backgroundStyle={{
          backgroundColor: theme.colors.background.default,
        }}
        handleIndicatorStyle={{
          backgroundColor: theme.colors.border.default,
          width: 40,
        }}
        onDismiss={handleSheetDismiss}
      >
        <BottomSheetView style={styles.container}>
          <View style={styles.iconContainer}>
            <Ionicons
              name="eye-off"
              size={40}
              color={theme.colors.warning[500]}
            />
          </View>

          <Text size="xl" weight="bold" style={{ textAlign: "center" }}>
            Mature content
          </Text>

          <Text
            size="sm"
            mode="subtle"
            style={{ textAlign: "center", marginTop: 12, lineHeight: 20 }}
          >
            Mature content is hidden by default. You can change this in the
            Settings.
          </Text>

          <Box gap="sm" style={{ marginTop: 24, width: "100%", paddingBottom: bottomPadding }}>
            <Button size="lg" rounded="lg" onPress={handleGoToSettings}>
              <Button.Text weight="semibold">Go to settings</Button.Text>
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
              <Button.Text weight="semibold">Dismiss</Button.Text>
            </Button>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
    );
  }

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      enablePanDownToClose={false}
      enableHandlePanningGesture={false}
      enableContentPanningGesture={false}
      enableDynamicSizing
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: theme.colors.background.default,
      }}
      handleIndicatorStyle={{
        backgroundColor: theme.colors.border.default,
        width: 40,
      }}
      onDismiss={handleSheetDismiss}
    >
      <BottomSheetView style={styles.container}>
        <View style={styles.iconContainer}>
          <Ionicons
            name="eye-off"
            size={40}
            color={theme.colors.warning[500]}
          />
        </View>

        <Text size="xl" weight="bold" style={{ textAlign: "center" }}>
          Adult Content
        </Text>

        <Text
          size="sm"
          mode="subtle"
          style={{ textAlign: "center", marginTop: 12, lineHeight: 20 }}
        >
          Mirage is uncensored and includes mature content like adult content,
          violence, and other NSFW material. Would you like to see this content
          in your feed?
        </Text>

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

        <Text
          size="xs"
          mode="subtle"
          style={{ textAlign: "center", marginTop: 16, paddingBottom: bottomPadding }}
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
