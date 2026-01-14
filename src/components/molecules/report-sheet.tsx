import { triggerHaptic } from "@/src/components/utils/haptics";
import { EvilIcons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Dimensions, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Button, Text } from "@/src/components/ui/primitives";

type ReportReason = {
  id: string;
  label: string;
  description: string;
};

const REPORT_REASONS: ReportReason[] = [
  {
    id: "harassment",
    label: "Harassment",
    description:
      "Threatening, bullying, or intimidating behavior targeting a specific person or group.",
  },
  {
    id: "threatening_violence",
    label: "Threatening violence",
    description:
      "Content that threatens, encourages, or glorifies acts of violence against people or animals.",
  },
  {
    id: "hate",
    label: "Hate",
    description:
      "Content promoting hatred or discrimination based on identity, race, religion, or orientation.",
  },
  {
    id: "minor_abuse",
    label: "Minor abuse or sexualization",
    description:
      "Any content that exploits, sexualizes, or endangers minors in any way.",
  },
  {
    id: "personal_info",
    label: "Sharing personal information",
    description:
      "Exposing private information like addresses, phone numbers, or financial details without consent.",
  },
  {
    id: "intimate_media",
    label: "Non-consensual intimate media",
    description:
      "Sharing intimate images or videos of someone without their explicit permission.",
  },
  {
    id: "prohibited_transaction",
    label: "Prohibited transaction",
    description:
      "Attempting to buy, sell, or trade illegal goods, services, or regulated items.",
  },
  {
    id: "impersonation",
    label: "Impersonation",
    description:
      "Pretending to be someone else or a brand in a misleading or deceptive manner.",
  },
  {
    id: "manipulated_content",
    label: "Manipulated content",
    description:
      "Deepfakes, doctored media, or intentionally misleading content presented as authentic.",
  },
  {
    id: "copyright",
    label: "Copyright violation",
    description:
      "Using copyrighted material without proper authorization from the rights holder.",
  },
  {
    id: "trademark",
    label: "Trademark violation",
    description:
      "Unauthorized use of registered trademarks, logos, or brand identities.",
  },
  {
    id: "self_harm",
    label: "Self-harm or suicide",
    description:
      "Content that promotes, glorifies, or provides instructions for self-harm or suicide.",
  },
  {
    id: "spam",
    label: "Spam",
    description:
      "Repetitive, unwanted, or misleading content designed to manipulate or deceive users.",
  },
  {
    id: "contributor_violation",
    label: "Contributor Program violation",
    description:
      "Violations of the contributor program guidelines, including fraudulent activity.",
  },
];

type ReportSheetProps = {
  /** The type of content being reported */
  targetType?: "post" | "comment";
  /** Callback when report is submitted */
  onSubmit?: (reason: string) => void;
  /** Callback when sheet is dismissed */
  onDismiss?: () => void;
  /** Loading state */
  isLoading?: boolean;
};

export type ReportSheetRef = {
  present: () => void;
  dismiss: () => void;
};

// Grid option component
const ReportOption = ({
  reason,
  isSelected,
  onPress,
}: {
  reason: ReportReason;
  isSelected: boolean;
  onPress: () => void;
}) => {
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";

  // Unselected: white bg in dark mode, transparent with border in light mode
  // Selected: blue background
  const backgroundColor = isSelected
    ? theme.colors.brand[500]
    : isDark
    ? "#FFFFFF"
    : "transparent";

  const borderColor = isSelected
    ? theme.colors.brand[500]
    : isDark
    ? "#FFFFFF"
    : theme.colors.border.default;

  const textColor = isSelected
    ? "#FFFFFF"
    : isDark
    ? "#000000"
    : theme.colors.text.default;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionButton,
        {
          backgroundColor,
          borderWidth: 1,
          borderColor,
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text
        size="sm"
        weight="medium"
        style={{ color: textColor, textAlign: "center" }}
        numberOfLines={2}
      >
        {reason.label}
      </Text>
    </Pressable>
  );
};

export const ReportSheet = forwardRef<ReportSheetRef, ReportSheetProps>(
  ({ targetType = "post", onSubmit, onDismiss, isLoading = false }, ref) => {
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const { theme } = useUnistyles();
    const insets = useSafeAreaInsets();
    const [selectedReason, setSelectedReason] = useState<ReportReason | null>(
      null
    );

    const present = useCallback(() => {
      setSelectedReason(null);
      // Pass 0 to open at the first (and only) snap point
      bottomSheetRef.current?.present(0);
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
      [onDismiss]
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
      []
    );

    const handleReasonSelect = useCallback((reason: ReportReason) => {
      triggerHaptic("selection");
      setSelectedReason(reason);
    }, []);

    const handleNext = useCallback(() => {
      if (!selectedReason) return;
      triggerHaptic("medium");
      onSubmit?.(selectedReason.label);
    }, [selectedReason, onSubmit]);

    const screenHeight = Dimensions.get("window").height;

    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        enableDynamicSizing
        maxDynamicContentSize={screenHeight * 0.9}
        enablePanDownToClose
        onChange={handleSheetChanges}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: theme.colors.background.default }}
        handleIndicatorStyle={{ backgroundColor: theme.colors.border.default }}
      >
        <BottomSheetView style={styles.container}>
          {/* Header */}
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

          {/* Explanation Text */}
          <View style={styles.explanationContainer}>
            <Text size="lg" weight="semibold" style={styles.explanation}>
              Thanks for looking out for yourself and your fellow users by
              reporting things that break the rules. Let us know what's
              happening, and we'll look into it.
            </Text>
          </View>

          {/* Options Grid */}
          <View style={styles.optionsContainer}>
            <View style={styles.optionsGrid}>
              {REPORT_REASONS.map((reason) => (
                <ReportOption
                  key={reason.id}
                  reason={reason}
                  isSelected={selectedReason?.id === reason.id}
                  onPress={() => handleReasonSelect(reason)}
                />
              ))}
            </View>
          </View>

          {/* Footer */}
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
            {/* Selected Option Info */}
            {selectedReason ? (
              <View style={styles.selectedInfo}>
                <Text size="md" weight="semibold">
                  {selectedReason.label}
                </Text>
                <Text
                  size="sm"
                  mode="subtle"
                  style={styles.selectedDescription}
                  numberOfLines={3}
                >
                  {selectedReason.description}
                </Text>
              </View>
            ) : (
              <View style={styles.selectedInfo}>
                <Text size="md" mode="subtle" weight="medium">
                  Select a reason
                </Text>
                <Text
                  size="sm"
                  mode="subtle"
                  style={styles.selectedDescription}
                >
                  Choose the option that best describes the issue you're
                  reporting.
                </Text>
              </View>
            )}

            {/* Next Button */}
            <Button
              size="lg"
              mode="brand"
              rounded="full"
              onPress={handleNext}
              disabled={!selectedReason || isLoading}
              loading={isLoading}
              style={styles.nextButton}
            >
              <Button.Text>Next</Button.Text>
            </Button>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
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
  explanationContainer: {
    paddingHorizontal: theme.spacing.lg,
  },
  explanation: {
    marginBottom: theme.spacing.md,
    lineHeight: 20,
  },
  optionsContainer: {
    paddingHorizontal: theme.spacing.lg,
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  optionButton: {
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.full,
    minHeight: 30,
    justifyContent: "center",
  },
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    marginTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.default,
  },
  selectedInfo: {
    marginBottom: theme.spacing.md,
  },
  selectedDescription: {
    marginTop: theme.spacing.xs,
    lineHeight: 20,
  },
  nextButton: {
    width: "100%",
  },
}));
