import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useMemo, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Divider, Icon, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

type ActivePlanCardProps = {
  planTitle: string;
  balance: number;
  reserve: number;
  autoRenew?: boolean;
  subscriptionExpiry?: number;
  autoRenewLoading?: boolean;
  onToggleAutoRenew?: () => void;
};

const PLAN_COLORS: Record<string, string> = {
  Free: "#6B7280",
  Subscriber: "#F59E0B",
  Agent: "#EF4444",
};

const PLAN_ICONS: Record<string, string> = {
  Free: "person-outline",
  Subscriber: "shield-checkmark-outline",
  Agent: "diamond-outline",
};

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

function formatTimeUntil(unixSeconds: number): string | null {
  const now = Math.floor(Date.now() / 1000);
  const diff = unixSeconds - now;
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export const ActivePlanCard = memo(function ActivePlanCard({
  planTitle,
  balance,
  reserve,
  autoRenew,
  subscriptionExpiry,
  autoRenewLoading,
  onToggleAutoRenew,
}: ActivePlanCardProps) {
  const { theme } = useUnistyles();
  const planColor = PLAN_COLORS[planTitle] || PLAN_COLORS.Free;
  const planIcon = PLAN_ICONS[planTitle] || PLAN_ICONS.Free;
  const isFree = planTitle === "Free";
  const renewalTime = subscriptionExpiry ? formatTimeUntil(subscriptionExpiry) : null;

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

  const handleCloseBalanceInfo = useCallback(() => setShowBalanceInfo(false), []);
  const handleCloseReserveInfo = useCallback(() => setShowReserveInfo(false), []);

  const containerStyle = useMemo(
    () => [styles.container, { backgroundColor: theme.colors.background.default }],
    [theme.colors.background.default]
  );

  const iconBgStyle = useMemo(
    () => [styles.iconContainer, { backgroundColor: `${planColor}20` }],
    [planColor]
  );

  const titleStyle = useMemo(
    () => ({ color: theme.colors.text.default }),
    [theme.colors.text.default]
  );

  const renewBadgeStyle = useMemo(
    () => ({
      backgroundColor: autoRenewLoading
        ? theme.colors.background.subtle
        : autoRenew
          ? `${planColor}20`
          : `${theme.colors.error[500]}15`,
    }),
    [autoRenewLoading, autoRenew, planColor, theme.colors.background.subtle, theme.colors.error]
  );

  const renewTextStyle = useMemo(
    () => ({
      color: autoRenewLoading
        ? theme.colors.text.subtle
        : autoRenew
          ? planColor
          : theme.colors.error[500],
    }),
    [autoRenewLoading, autoRenew, planColor, theme.colors.text.subtle, theme.colors.error]
  );

  const renewalTimeColor = autoRenew ? theme.colors.text.subtle : theme.colors.error[500];

  const renewalTimeStyle = useMemo(
    () => ({ color: renewalTimeColor }),
    [renewalTimeColor]
  );

  const verticalDividerStyle = useMemo(
    () => [styles.verticalDivider, { backgroundColor: theme.colors.border.subtle }],
    [theme.colors.border.subtle]
  );

  return (
    <Box rounded="lg" p="md" style={containerStyle}>
      <Box direction="row" alignItems="center" gap="sm">
        <Box center rounded="md" style={iconBgStyle}>
          <Icon
            icon={Ionicons}
            name={planIcon as any}
            size={24}
            color={planColor}
          />
        </Box>
        <Box flex>
          <Text size="xs" mode="subtle" style={styles.label}>
            CURRENT TIER
          </Text>
          <Text size="xxl" weight="semibold" style={titleStyle}>
            {planTitle}
          </Text>
        </Box>
        {!isFree && (
          <Pressable
            onPress={autoRenewLoading ? undefined : onToggleAutoRenew}
            disabled={autoRenewLoading}
            hitSlop={8}
          >
            <Box px="sm" py="xs" rounded="full" style={renewBadgeStyle}>
              <Text size="xs" weight="semibold" style={renewTextStyle}>
                {autoRenewLoading ? "Processing..." : autoRenew ? "AUTO-RENEW" : "NOT RENEWING"}
              </Text>
            </Box>
          </Pressable>
        )}
      </Box>

      {!isFree && renewalTime && (
        <Box direction="row" alignItems="center" gap="xs" mt="sm">
          <Icon
            icon={Ionicons}
            name="time-outline"
            size={14}
            color={renewalTimeColor}
          />
          <Text size="xs" style={renewalTimeStyle}>
            {autoRenew ? `Renews in ${renewalTime}` : `Expires in ${renewalTime}`}
          </Text>
        </Box>
      )}

      <Divider style={styles.divider} size="extraThin" />

      <Box direction="row" gap="md">
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

        <View style={verticalDividerStyle} />

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

      <InfoPopup
        visible={showBalanceInfo}
        text={BALANCE_INFO}
        onClose={handleCloseBalanceInfo}
      />

      <InfoPopup
        visible={showReserveInfo}
        text={RESERVE_INFO}
        onClose={handleCloseReserveInfo}
      />
    </Box>
  );
});

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
