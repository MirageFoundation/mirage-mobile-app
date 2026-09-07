import { Ionicons } from "@expo/vector-icons";
import { memo, useMemo } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import type { DailyQuota, RenewalWarning } from "@/src/domain/communities";
import {
  formatQuotaReset,
  shouldShowRenewalNotice,
} from "@/src/domain/subscriptions";
import { useRouter } from "@/src/navigation/guarded-router";

type AccountStatusNoticesProps = {
  quota?: DailyQuota | null;
  renewal?: RenewalWarning | null;
  effectivePaid?: boolean | null;
  userLevel?: number | null;
  showQuota?: boolean;
  showRenewal?: boolean;
  compact?: boolean;
};

function formatExpiry(unix: number): string {
  return new Date(unix * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const AccountStatusNotices = memo(function AccountStatusNotices({
  quota,
  renewal,
  effectivePaid,
  userLevel,
  showQuota = true,
  showRenewal = true,
  compact = false,
}: AccountStatusNoticesProps) {
  const { theme } = useUnistyles();
  const router = useRouter();
  const showRenewalNotice = showRenewal
    ? shouldShowRenewalNotice({ effectivePaid, userLevel, warning: renewal ?? null })
    : false;
  const quotaRow = showQuota ? quota : null;

  const quotaLabel = useMemo(() => {
    if (!quotaRow) return null;
    if (quotaRow.remaining === 0) {
      return `Used ${quotaRow.used.toLocaleString()} of ${quotaRow.limit.toLocaleString()} · resets ${formatQuotaReset(quotaRow.reset_at)}`;
    }
    return `${quotaRow.used.toLocaleString()} of ${quotaRow.limit.toLocaleString()} used`;
  }, [quotaRow]);

  if (!quotaRow && !showRenewalNotice) return null;

  return (
    <View style={styles.list}>
      {quotaRow && quotaLabel ? (
        <Box direction="row" justifyContent="space-between" alignItems="center" style={styles.quotaRow}>
          <Text
            size="sm"
            weight="medium"
            style={{ color: quotaRow.remaining === 0 ? theme.colors.error[500] : theme.colors.text.default }}
          >
            Daily no-PoW
          </Text>
          <Text size="sm" mode="subtle" style={styles.quotaValue}>
            {quotaLabel}
          </Text>
        </Box>
      ) : null}
      {showRenewalNotice && renewal ? (
        <Pressable
          onPress={() => router.push("/subscription")}
          style={[
            styles.renewalCard,
            compact && styles.renewalCompact,
            {
              backgroundColor: theme.colors.background.subtle,
              borderColor: theme.colors.border.subtle,
            },
          ]}
        >
          <Box direction="row" alignItems="center" gap="sm">
            <Ionicons name="time-outline" size={16} color={theme.colors.text.default} />
            <Box flex>
              <Text size="sm" weight="semibold">
                Subscription renewal
              </Text>
              <Text size="xs" mode="subtle">
                Expires {formatExpiry(renewal.expiry)}
              </Text>
            </Box>
          </Box>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  list: {
    gap: theme.spacing.sm,
  },
  quotaRow: {
    paddingVertical: theme.spacing.xs,
  },
  quotaValue: {
    flexShrink: 1,
    textAlign: "right",
    marginLeft: theme.spacing.sm,
  },
  renewalCard: {
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
  },
  renewalCompact: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
}));
