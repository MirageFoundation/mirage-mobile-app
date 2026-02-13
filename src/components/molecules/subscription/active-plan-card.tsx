import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Divider, Icon, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

type ActivePlanCardProps = {
  /** Current plan tier: Free, Trusted, Established, Distinguished */
  planTitle: string;
  /** User's MIRAGE balance */
  balance: number;
  /** User's MIRAGE reserve */
  reserve: number;
};

// Plan colors for visual distinction
const PLAN_COLORS: Record<string, string> = {
  Free: "#6B7280", // Gray
  Trusted: "#3B82F6", // Blue
  Established: "#8B5CF6", // Purple
  Distinguished: "#F59E0B", // Amber/Gold
};

// Plan icons
const PLAN_ICONS: Record<string, string> = {
  Free: "person-outline",
  Trusted: "shield-checkmark-outline",
  Established: "star-outline",
  Distinguished: "diamond-outline",
};

// Info text for balance and reserve
const BALANCE_INFO =
  "Spendable wallet balance in MIRAGE.\nThis is what a subscription will be paid with.";
const RESERVE_INFO =
  "Escrowed reserve in MIRAGE used for relayed gas and subscriptions.\nHeld internally by the blockchain and used to process all transactions while subscribed.\nNot directly spendable and will get burned if not used.";

type InfoPopupProps = {
  visible: boolean;
  text: string;
  onClose: () => void;
};

function InfoPopup({ visible, text, onClose }: InfoPopupProps) {
  const { theme } = useUnistyles();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.popupOverlay} onPress={onClose}>
        <View
          style={[
            styles.popupContainer,
            {
              backgroundColor: theme.colors.background.default,
              shadowColor: theme.colors.text.default,
            },
          ]}
        >
          <Text size="sm" style={styles.popupText}>
            {text}
          </Text>
          <Pressable
            onPress={onClose}
            style={[
              styles.popupCloseButton,
              { backgroundColor: theme.colors.background.subtle },
            ]}
            hitSlop={8}
          >
            <Icon
              icon={Ionicons}
              name="close"
              size={16}
              color={theme.colors.text.subtle}
            />
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

export function ActivePlanCard({
  planTitle,
  balance,
  reserve,
}: ActivePlanCardProps) {
  const { theme } = useUnistyles();
  const planColor = PLAN_COLORS[planTitle] || PLAN_COLORS.Free;
  const planIcon = PLAN_ICONS[planTitle] || PLAN_ICONS.Free;

  // Info popup state
  const [showBalanceInfo, setShowBalanceInfo] = useState(false);
  const [showReserveInfo, setShowReserveInfo] = useState(false);

  const handleBalancePress = useCallback(() => {
    triggerHaptic("light");
    setShowBalanceInfo(true);
  }, []);

  const handleReservePress = useCallback(() => {
    triggerHaptic("light");
    setShowReserveInfo(true);
  }, []);

  return (
    <Box
      rounded="lg"
      p="md"
      style={[
        styles.container,
        { backgroundColor: theme.colors.background.default },
      ]}
    >
      {/* Plan Title with Icon */}
      <Box direction="row" alignItems="center" gap="sm">
        <Box
          center
          rounded="md"
          style={[styles.iconContainer, { backgroundColor: `${planColor}20` }]}
        >
          <Icon
            icon={Ionicons}
            name={planIcon as any}
            size={24}
            color={planColor}
          />
        </Box>
        <Box flex>
          <Text size="xs" mode="subtle" style={styles.label}>
            CURRENT PLAN
          </Text>
          <Text
            size="xxl"
            weight="semibold"
            style={{ color: theme.colors.text.default }}
          >
            {planTitle}
          </Text>
        </Box>
      </Box>

      {/* Divider */}
      <Divider style={styles.divider} size="extraThin" />

      {/* Balance & Reserve Stats */}
      <Box direction="row" gap="md">
        {/* Balance */}
        <Pressable
          style={styles.statPressable}
          onPress={handleBalancePress}
          hitSlop={4}
        >
          <Box flex>
            <Box
              direction="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Text size="xs" mode="subtle" style={styles.statLabel}>
                Balance (MIRAGE)
              </Text>
            </Box>
            <Box direction="row" alignItems="center">
              <Text size="xxl" weight="semibold">
                {balance.toLocaleString()}
              </Text>
            </Box>
          </Box>
        </Pressable>

        {/* Vertical Divider */}
        <View
          style={[
            styles.verticalDivider,
            { backgroundColor: theme.colors.border.subtle },
          ]}
        />

        {/* Reserve */}
        <Pressable
          style={styles.statPressable}
          onPress={handleReservePress}
          hitSlop={4}
        >
          <Box flex>
            <Box
              direction="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Text size="xs" mode="subtle" style={styles.statLabel}>
                Reserve (MIRAGE)
              </Text>
            </Box>
            <Box direction="row" alignItems="center">
              <Text size="xxl" weight="semibold">
                {reserve.toLocaleString()}
              </Text>
            </Box>
          </Box>
        </Pressable>
      </Box>

      {/* Balance Info Popup */}
      <InfoPopup
        visible={showBalanceInfo}
        text={BALANCE_INFO}
        onClose={() => setShowBalanceInfo(false)}
      />

      {/* Reserve Info Popup */}
      <InfoPopup
        visible={showReserveInfo}
        text={RESERVE_INFO}
        onClose={() => setShowReserveInfo(false)}
      />
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  iconContainer: {
    width: 48,
    height: 48,
  },
  label: {
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  divider: {
    marginVertical: theme.spacing.sm + 5,
  },
  statPressable: {
    flex: 1,
  },
  statLabel: {
    marginBottom: 4,
  },
  verticalDivider: {
    width: 1,
    height: "100%",
  },
  popupOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.lg,
  },
  popupContainer: {
    maxWidth: 320,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  popupText: {
    lineHeight: 22,
    color: theme.colors.text.default,
    paddingRight: theme.spacing.lg,
  },
  popupCloseButton: {
    position: "absolute",
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
}));
