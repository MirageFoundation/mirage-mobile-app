import { triggerHaptic } from "@/src/components/utils/haptics";
import { EvilIcons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Dimensions, Keyboard, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Button, Text } from "@/src/components/ui/primitives";

type ReportSheetProps = {
  targetType?: "post" | "comment";
  onSubmit?: (reason: string) => void;
  onDismiss?: () => void;
  isLoading?: boolean;
};

export type ReportSheetRef = {
  present: () => void;
  dismiss: () => void;
};

export const ReportSheet = forwardRef<ReportSheetRef, ReportSheetProps>(
  ({ targetType = "post", onSubmit, onDismiss, isLoading = false }, ref) => {
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const { theme } = useUnistyles();
    const insets = useSafeAreaInsets();
    const [reason, setReason] = useState("");

    const present = useCallback(() => {
      setReason("");
      bottomSheetRef.current?.present();
    }, []);

    const dismiss = useCallback(() => {
      bottomSheetRef.current?.dismiss();
    }, []);

    useImperativeHandle(ref, () => ({
      present,
      dismiss,
    }));

    const handleSheetChanges = useCallback(
      (index: number) => {
        if (index === -1) {
          onDismiss?.();
        }
      },
      [onDismiss],
    );

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.5}
        />
      ),
      [],
    );

    const handleNext = useCallback(() => {
      if (!reason.trim()) return;
      triggerHaptic("medium");
      Keyboard.dismiss();
      dismiss();
      onSubmit?.(reason.trim());
    }, [reason, onSubmit, dismiss]);

    const screenHeight = Dimensions.get("window").height;

    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        enableDynamicSizing
        maxDynamicContentSize={screenHeight * 0.9}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        onChange={handleSheetChanges}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: theme.colors.background.default }}
        handleIndicatorStyle={{ backgroundColor: theme.colors.border.default }}
      >
        <BottomSheetView style={styles.container}>
          <View style={styles.header}>
            <Pressable onPress={dismiss} style={[styles.closeButton]}>
              <EvilIcons
                name="close"
                size={28}
                color={theme.colors.text.default}
              />
            </Pressable>
            <Text size="lg" weight="bold" style={styles.headerTitle}>
              Submit a report
            </Text>
            <View style={styles.closeButtonPlaceholder} />
          </View>

          <View style={styles.content}>
            <Text size="lg" weight="semibold" style={styles.title}>
              Provide a short reason
            </Text>
            <BottomSheetTextInput
              value={reason}
              onChangeText={(text) => setReason(text.replace(/\n/g, ""))}
              maxLength={140}
              multiline
              blurOnSubmit
              returnKeyType="done"
              placeholder="Describe the issue..."
              placeholderTextColor={theme.colors.text.subtle}
              style={[
                styles.input,
                {
                  color: theme.colors.text.default,
                  borderColor: theme.colors.border.default,
                },
              ]}
            />
            <Text size="xs" mode="subtle" style={styles.charCount}>
              {reason.length}/140
            </Text>
          </View>

          <View
            style={[
              styles.footer,
              {
                backgroundColor: theme.colors.background.default,
                paddingBottom:
                  Platform.OS === "ios" ? insets.bottom : insets.bottom + 30,
              },
            ]}
          >
            <Button
              size="lg"
              mode="brand"
              rounded="full"
              onPress={handleNext}
              disabled={!reason.trim() || isLoading}
              loading={isLoading}
              style={styles.nextButton}
            >
              <Button.Text>Submit</Button.Text>
            </Button>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

ReportSheet.displayName = "ReportSheet";

const styles = StyleSheet.create((theme, rt) => ({
  container: {},
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonPlaceholder: {
    width: 32,
    height: 32,
  },
  content: {
    paddingHorizontal: theme.spacing.lg,
  },
  title: {
    marginBottom: theme.spacing.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    minHeight: 100,
    textAlignVertical: "top",
    fontSize: 16,
  },
  charCount: {
    textAlign: "right",
    marginTop: theme.spacing.xs,
  },
  footer: {
    paddingHorizontal: theme.spacing.lg,
    // paddingTop: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  nextButton: {
    width: "100%",
  },
}));
