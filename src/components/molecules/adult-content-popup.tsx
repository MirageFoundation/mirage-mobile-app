import { Box, Button, Text } from "@/src/components/ui/primitives";
import * as Sentry from "@sentry/react-native";
import { AdultPromptLifecycle, type AdultPromptPresentation } from "@/src/services/adult-prompt-lifecycle";
import { getAdultPromptActive } from "@/src/services/home-entry-prompt-orchestrator";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type AdultContentPopupProps = {
  visible: boolean;
  sessionKey: string;
  onEnable: () => void;
  onDecline: () => void;
  onGoToSettings?: () => void;
};

export const AdultContentPopup = ({
  visible,
  sessionKey,
  onEnable,
  onDecline,
  onGoToSettings,
}: AdultContentPopupProps) => {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const lifecycleRef = useRef<AdultPromptLifecycle | null>(null);
  const [presentation, setPresentation] = useState<AdultPromptPresentation | null>(null);
  const isAndroid = Platform.OS === "android";
  const bottomPadding = Math.max(insets.bottom, 24);

  useEffect(() => {
    const lifecycle = new AdultPromptLifecycle({
      schedule: requestAnimationFrame,
      cancel: cancelAnimationFrame,
      present: setPresentation,
      dismiss: () => bottomSheetRef.current?.dismiss(),
      onError: (error) => Sentry.captureException(error),
    });
    lifecycleRef.current = lifecycle;
    return () => {
      lifecycle.dispose();
      lifecycleRef.current = null;
    };
  }, []);

  useEffect(() => {
    lifecycleRef.current?.update(visible, sessionKey);
  }, [visible, sessionKey]);

  useEffect(() => {
    if (!presentation?.isCurrent()) return;
    try {
      bottomSheetRef.current?.present();
    } catch (error) {
      presentation.onError(error);
    }
  }, [presentation]);

  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", getAdultPromptActive);
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

  const complete = useCallback((action: () => void) => {
    if (presentation?.session !== sessionKey) return;
    presentation?.complete(action);
  }, [presentation, sessionKey]);

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
        key={presentation?.id ?? "idle"}
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
        onDismiss={presentation?.onDismiss}
        onChange={presentation?.onChange}
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
      key={presentation?.id ?? "idle"}
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
      onDismiss={presentation?.onDismiss}
      onChange={presentation?.onChange}
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
