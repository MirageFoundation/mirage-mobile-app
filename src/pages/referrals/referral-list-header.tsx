import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, ScrollView, Switch, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";

export type ReferralPeriod = "7d" | "30d" | "this_month" | "last_month";

const PERIOD_LABELS: Record<ReferralPeriod, string> = {
  "7d": "7 Days",
  "30d": "30 Days",
  this_month: "This Month",
  last_month: "Last Month",
};

interface ReferralListHeaderProps {
  inviteCodeRequired: boolean;
  effectiveEnabled: boolean;
  /** Whether copy/share is actually usable (see referrals-screen, BUG-028). */
  linkEnabled: boolean;
  toggleLoading: boolean;
  referralUrl: string | null;
  hasUsername: boolean;
  linkCopied: boolean;
  totalLabel: string | null;
  referralPeriod: ReferralPeriod;
  onTogglePrecheck: (value: boolean) => void;
  onCopyReferralLink: () => void;
  onShareReferralLink: () => void;
  onSelectPeriod: (period: ReferralPeriod) => void;
}

export function ReferralListHeader({
  inviteCodeRequired,
  effectiveEnabled,
  linkEnabled,
  toggleLoading,
  referralUrl,
  hasUsername,
  linkCopied,
  totalLabel,
  referralPeriod,
  onTogglePrecheck,
  onCopyReferralLink,
  onShareReferralLink,
  onSelectPeriod,
}: ReferralListHeaderProps) {
  const { theme } = useUnistyles();

  return (
    <>
      <View style={styles.heroSection}>
        <LinearGradient
          colors={[theme.colors.brand[500] + "20", "transparent"]}
          style={styles.heroGradient}
        />
        <View
          style={[
            styles.heroIconContainer,
            { backgroundColor: theme.colors.brand[500] + "15" },
          ]}
        >
          <Ionicons name="link" size={40} color={theme.colors.brand[500]} />
        </View>
        <Text size="xxl" weight="bold" style={styles.heroTitle}>
          Referral Links
        </Text>
        <Text size="md" mode="subtle" style={styles.heroSubtitle}>
          Lets people sign up via your personal link instead of sharing invite codes directly. Anyone with the link can use your codes, so leave this off if you want to hand them out manually.
        </Text>
      </View>

      {inviteCodeRequired && (
        <View style={[styles.toggleCard, { backgroundColor: theme.colors.background.default, borderColor: theme.colors.border.subtle }]}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text size="md" weight="semibold">Referral Link</Text>
          </View>
          <Switch
            value={effectiveEnabled}
            onValueChange={onTogglePrecheck}
            disabled={toggleLoading}
            accessibilityLabel="Enable referral link"
            trackColor={{ false: theme.colors.background.emphasis, true: "rgb(30,67,150)" }}
            thumbColor="#FFFFFF"
          />
        </View>
      )}

      {referralUrl ? (
        <View style={[styles.shareBoxCard, { backgroundColor: theme.colors.background.default, borderColor: theme.colors.border.subtle }]}>
          <Text size="sm" mode="subtle" style={{ marginBottom: 8 }}>Your referral link</Text>
          <View style={[styles.shareUrlRow, { backgroundColor: theme.colors.background.subtle, borderWidth: 1, borderColor: linkCopied ? "#10B981" : "transparent" }]}>
            <Text
              size="sm"
              weight="medium"
              numberOfLines={1}
              style={{ flex: 1, opacity: linkEnabled ? 1 : 0.4 }}
            >
              {referralUrl}
            </Text>
            <Pressable
              onPress={onCopyReferralLink}
              disabled={!linkEnabled}
              accessibilityRole="button"
              accessibilityLabel={linkCopied ? "Referral link copied" : "Copy referral link"}
              style={({ pressed }) => [styles.shareCopyBtn, pressed && { opacity: 0.7 }, !linkEnabled && { opacity: 0.3 }]}
            >
              <Ionicons name={linkCopied ? "checkmark" : "copy-outline"} size={18} color={linkCopied ? "#10B981" : theme.colors.brand[500]} />
            </Pressable>
          </View>
          <Pressable
            onPress={onShareReferralLink}
            disabled={!linkEnabled}
            accessibilityRole="button"
            accessibilityLabel="Share referral link"
            style={({ pressed }) => [
              styles.shareNativeBtn,
              { backgroundColor: theme.colors.brand[500] },
              pressed && { opacity: 0.7 },
              !linkEnabled && { opacity: 0.4 },
            ]}
          >
            <Feather name="share" size={16} color="#FFFFFF" />
            <Text size="sm" weight="medium" style={{ color: "#FFFFFF", marginLeft: 6 }}>Share</Text>
          </Pressable>
          {!linkEnabled && (
            <Text size="xs" mode="subtle" style={{ textAlign: "center", marginTop: 8 }}>
              Enable the toggle above to share your referral link
            </Text>
          )}
        </View>
      ) : !hasUsername ? (
        <View style={[styles.shareBoxCard, { backgroundColor: theme.colors.background.default, borderColor: theme.colors.border.subtle }]}>
          <Text size="sm" mode="subtle" style={{ textAlign: "center" }}>
            Set a username to get your personal referral link.
          </Text>
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <Text size="md" weight="semibold">Your Referrals</Text>
          {totalLabel && <Text size="sm" mode="subtle">{totalLabel}</Text>}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(Object.keys(PERIOD_LABELS) as ReferralPeriod[]).map((period) => (
              <Pressable
                key={period}
                onPress={() => onSelectPeriod(period)}
                accessibilityRole="tab"
                accessibilityState={{ selected: referralPeriod === period }}
                style={[
                  styles.periodTab,
                  {
                    backgroundColor: referralPeriod === period ? theme.colors.brand[500] : theme.colors.background.subtle,
                  },
                ]}
              >
                <Text
                  size="sm"
                  weight={referralPeriod === period ? "semibold" : "regular"}
                  style={{ color: referralPeriod === period ? "#FFFFFF" : theme.colors.text.default }}
                >
                  {PERIOD_LABELS[period]}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  heroSection: {
    alignItems: "center",
    paddingVertical: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    position: "relative",
    overflow: "hidden",
    borderRadius: theme.radius.xl,
  },
  heroGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
  heroTitle: {
    textAlign: "center",
    marginBottom: theme.spacing.xs,
  },
  heroSubtitle: {
    textAlign: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    marginBottom: theme.spacing.md,
  },
  shareBoxCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    marginBottom: theme.spacing.lg,
  },
  shareUrlRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  shareCopyBtn: {
    padding: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
  },
  shareNativeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
  },
  sectionHeader: {
    marginBottom: theme.spacing.sm,
  },
  periodTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
}));
