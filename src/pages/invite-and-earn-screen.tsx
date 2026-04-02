import { EvilIcons, Ionicons, Feather } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "@/src/hooks/use-router";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState, useRef, useEffect } from "react";
import {
  Pressable,
  ScrollView,
  View,
  Share,
  Platform,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  FadeIn,
  withRepeat,
  interpolate,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";

import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  usePreferencesStore,
  getShareBaseUrl,
} from "@/src/stores";
import { useInviteCodes } from "@/src/api/read/hooks";
import type { InviteCode } from "@/src/api/types";

const SkeletonBox = ({
  width,
  height,
  style,
  borderRadius,
}: {
  width: number | `${number}%`;
  height: number;
  style?: object;
  borderRadius?: number;
}) => {
  const { theme } = useUnistyles();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1200 }), -1, false);
  }, [shimmer]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.6, 0.3]),
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          backgroundColor: theme.colors.background.subtle,
          borderRadius: borderRadius ?? theme.radius.sm,
        },
        animatedStyle,
        style,
      ]}
    />
  );
};

const InviteCodeCardSkeleton = () => {
  const { theme } = useUnistyles();

  return (
    <View
      style={[
        styles.inviteCodeCard,
        {
          backgroundColor: theme.colors.background.default,
          borderColor: theme.colors.border.subtle,
        },
      ]}
    >
      <View style={styles.codeContent}>
        <View style={styles.codeHeader}>
          <SkeletonBox width={6} height={6} borderRadius={3} />
          <SkeletonBox width={55} height={14} />
        </View>
        <SkeletonBox width={140} height={22} style={{ marginTop: 4 }} />
      </View>
      <View style={styles.codeActions}>
        <SkeletonBox width={40} height={40} borderRadius={theme.radius.md} />
        <SkeletonBox width={40} height={40} borderRadius={theme.radius.md} />
      </View>
    </View>
  );
};

const InviteCodesSkeleton = ({ count = 3 }: { count?: number }) => {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <SkeletonBox width={120} height={18} />
        <SkeletonBox width={20} height={20} borderRadius={10} />
      </View>
      <View style={styles.codesGrid}>
        {Array.from({ length: count }).map((_, i) => (
          <InviteCodeCardSkeleton key={i} />
        ))}
      </View>
    </View>
  );
};

const InviteCodeCard = ({
  code,
  isUsed,
  onShare,
}: {
  code: InviteCode;
  isUsed: boolean;
  onShare: (code: string) => void;
}) => {
  const { theme, rt } = useUnistyles();
  const [copied, setCopied] = useState(false);
  const scale = useSharedValue(1);

  const isLightTheme = rt.themeName !== "dark";

  const handleCopy = useCallback(async () => {
    if (isUsed) return;
    try {
      await Clipboard.setStringAsync(code.code);
      triggerHaptic("success");
      setCopied(true);
      scale.value = withSequence(
        withTiming(0.95, { duration: 100 }),
        withTiming(1, { duration: 100 }),
      );
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      Sentry.addBreadcrumb({ category: "invite", message: "Clipboard copy failed", data: { error: String(error) }, level: "warning" });
    }
  }, [code.code, isUsed, scale]);

  const handleShare = useCallback(() => {
    if (isUsed) return;
    triggerHaptic("light");
    onShare(code.code);
  }, [code.code, isUsed, onShare]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle} entering={FadeIn.duration(300)}>
      <View
        style={[
          styles.inviteCodeCard,
          {
            backgroundColor: isUsed
              ? theme.colors.background.subtle
              : theme.colors.background.default,
            borderColor: isUsed
              ? theme.colors.border.subtle
              : theme.colors.brand[500] + "40",
            opacity: isUsed ? 0.6 : 1,
          },
          !isUsed &&
            isLightTheme && {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08,
              shadowRadius: 8,
              elevation: 4,
            },
        ]}
      >
        <View style={styles.codeContent}>
          <View style={styles.codeHeader}>
            <View
              style={[
                styles.codeStatusDot,
                {
                  backgroundColor: isUsed
                    ? theme.colors.text.subtle
                    : theme.colors.success[500],
                },
              ]}
            />
            <Text size="sm" mode="subtle">
              {isUsed ? "Used" : "Available"}
            </Text>
          </View>
          <Text
            size="xl"
            weight="bold"
            style={[
              styles.codeText,
              {
                letterSpacing: 2,
                color: isUsed
                  ? theme.colors.text.subtle
                  : theme.colors.text.default,
              },
            ]}
          >
            {code.code}
          </Text>
        </View>
        {!isUsed && (
          <View style={styles.codeActions}>
            <Pressable
              onPress={handleCopy}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  backgroundColor: copied
                    ? theme.colors.success[500]
                    : theme.colors.background.subtle,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons
                name={copied ? "checkmark" : "copy-outline"}
                size={18}
                color={copied ? "#FFFFFF" : theme.colors.text.default}
              />
            </Pressable>
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: theme.colors.brand[500] },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="share-outline" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        )}
      </View>
    </Animated.View>
  );
};

const ShareCodeSheet = ({
  sheetRef,
  code,
  onDismiss,
}: {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  code: string | null;
onDismiss: () => void;
}) => {
  const { theme } = useUnistyles();
const insets = useSafeAreaInsets();
const shareServer = usePreferencesStore((s) => s.shareServer);
const [copiedCode, setCopiedCode] = useState(false);
 const [copiedLink, setCopiedLink] = useState(false);

  const shareUrl = code
    ? `${getShareBaseUrl(shareServer)}/signup?invite=${code}`
    : "";
  const shareMessage = `Join me on Mirage! Use my invite code: ${code}\n\n${shareUrl}`;

  const handleCopyCode = useCallback(async () => {
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
      triggerHaptic("success");
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (error) {
      Sentry.addBreadcrumb({ category: "invite", message: "Clipboard copy code failed", data: { error: String(error) }, level: "warning" });
    }
  }, [code]);

  const handleCopyLink = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(shareUrl);
      triggerHaptic("success");
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (error) {
      Sentry.addBreadcrumb({ category: "invite", message: "Clipboard copy link failed", data: { error: String(error) }, level: "warning" });
    }
  }, [shareUrl]);

  const handleNativeShare = useCallback(async () => {
    try {
      triggerHaptic("light");
      await Share.share({
        message: shareUrl,
        title: "Join Mirage",
      });
      sheetRef.current?.dismiss();
    } catch (error) {
      Sentry.addBreadcrumb({ category: "invite", message: "Native share failed", data: { error: String(error) }, level: "warning" });
    }
  }, [shareUrl, sheetRef]);

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

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={[480]}
      enableDynamicSizing={false}
      backdropComponent={renderBackdrop}
      onDismiss={onDismiss}
      handleIndicatorStyle={{ backgroundColor: theme.colors.text.subtle }}
      backgroundStyle={{ backgroundColor: theme.colors.background.default }}
    >
      <BottomSheetView
        style={[styles.sheetContent, { paddingBottom: insets.bottom + 32 }]}
      >
        <View style={styles.sheetHeader}>
          <View
            style={[
              styles.sheetIconContainer,
              { backgroundColor: theme.colors.brand[500] + "15" },
            ]}
          >
            <Ionicons name="gift" size={32} color={theme.colors.brand[500]} />
          </View>
          <Text size="xl" weight="bold" style={styles.sheetTitle}>
            Share Invite Code
          </Text>
          <Text size="md" mode="subtle" style={styles.sheetSubtitle}>
            Invite a friend to join Mirage
          </Text>
        </View>

      <View
        style={[
          styles.codeDisplayContainer,
          { backgroundColor: theme.colors.background.subtle },
        ]}
      >
          <Text size="sm" mode="subtle" style={styles.codeLabel}>
            YOUR INVITE CODE
          </Text>
          <Text size="mega" weight="bold" style={{ letterSpacing: 4 }}>
            {code}
          </Text>
        </View>

        <View style={styles.shareOptions}>
          <Pressable
            onPress={handleCopyCode}
            style={({ pressed }) => [
              styles.shareOption,
              { backgroundColor: theme.colors.background.subtle },
              pressed && { opacity: 0.7 },
            ]}
          >
            <View
              style={[
                styles.shareOptionIcon,
                {
                  backgroundColor: copiedCode
                    ? theme.colors.success[500]
                    : theme.colors.brand[500],
                },
              ]}
            >
              <Ionicons
                name={copiedCode ? "checkmark" : "copy-outline"}
                size={20}
                color="#FFFFFF"
              />
            </View>
            <Text size="sm" weight="medium">
              {copiedCode ? "Copied!" : "Copy Code"}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleCopyLink}
            style={({ pressed }) => [
              styles.shareOption,
              { backgroundColor: theme.colors.background.subtle },
              pressed && { opacity: 0.7 },
            ]}
          >
            <View
              style={[
                styles.shareOptionIcon,
                {
                  backgroundColor: copiedLink
                    ? theme.colors.success[500]
                    : "#6366F1",
                },
              ]}
            >
              <Ionicons
                name={copiedLink ? "checkmark" : "link-outline"}
                size={20}
                color="#FFFFFF"
              />
            </View>
            <Text size="sm" weight="medium">
              {copiedLink ? "Copied!" : "Copy Link"}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleNativeShare}
            style={({ pressed }) => [
              styles.shareOption,
              { backgroundColor: theme.colors.background.subtle },
              pressed && { opacity: 0.7 },
            ]}
          >
            <View
              style={[styles.shareOptionIcon, { backgroundColor: "#10B981" }]}
            >
              <Feather name="share" size={20} color="#FFFFFF" />
            </View>
            <Text size="sm" weight="medium">
              Share
            </Text>
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
};

export function InviteAndEarnScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const { data: inviteCodesData, isLoading, refetch } = useInviteCodes();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const availableCodes = inviteCodesData?.codes.filter((c) => !c.is_used) ?? [];
  const usedCodes = inviteCodesData?.codes.filter((c) => c.is_used) ?? [];
  const availableCount = inviteCodesData?.available ?? 0;
  const totalCount = inviteCodesData?.total ?? 0;

  const handleBack = useCallback(() => {
    triggerHaptic("light");
    router.back();
  }, [router]);

  const handleShareCode = useCallback((code: string) => {
    setSelectedCode(code);
    sheetRef.current?.present();
  }, []);

  const handleSheetDismiss = useCallback(() => {
    setSelectedCode(null);
  }, []);

  return (
    <Box flex background="base">
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top,
            backgroundColor: theme.colors.background.default,
            borderBottomColor: theme.colors.border.subtle,
          },
        ]}
      >
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <EvilIcons name="close" size={28} color={theme.colors.text.default} />
        </Pressable>
        <Text size="lg" weight="medium">
          Invite
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
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
            <Ionicons name="gift" size={40} color={theme.colors.brand[500]} />
          </View>
          <Text size="xxl" weight="bold" style={styles.heroTitle}>
            Invite Friends
          </Text>
          <Text size="md" mode="subtle" style={styles.heroSubtitle}>
            {availableCount > 0
              ? "Mirage is now invite-only — because great conversations require great people! But don't fret, we've given you some invite codes for your friends. Use them wisely."
              : "Mirage is now invite-only — because great conversations require great people! Unfortunately, you're out of invite codes. But don't worry, we might drop some more soon. Stay tuned!"}
          </Text>

        </View>

        {isLoading ? (
          <InviteCodesSkeleton count={3} />
        ) : (
          <>
            {availableCodes.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text size="md" weight="semibold">
                    Available Codes
                  </Text>
                  <View
                    style={[
                      styles.countBadge,
                      { backgroundColor: theme.colors.success[500] + "20" },
                    ]}
                  >
                    <Text
                      size="sm"
                      weight="semibold"
                      style={{ color: theme.colors.success[500] }}
                    >
                      {availableCount}
                    </Text>
                  </View>
                </View>
                <View style={styles.codesGrid}>
                  {availableCodes.map((code) => (
                    <InviteCodeCard
                      key={code.code}
                      code={code}
                      isUsed={false}
                      onShare={handleShareCode}
                    />
                  ))}
                </View>
              </View>
            )}

            {usedCodes.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text size="md" weight="semibold">
                    Used Codes
                  </Text>
                  <View
                    style={[
                      styles.countBadge,
                      { backgroundColor: theme.colors.background.lighter },
                    ]}
                  >
                    <Text
                      size="sm"
                      weight="bold"
                      style={{ color: theme.colors.text.default }}
                    >
                      {usedCodes.length}
                    </Text>
                  </View>
                </View>
                <View style={styles.codesGrid}>
                  {usedCodes.map((code) => (
                    <InviteCodeCard
                      key={code.code}
                      code={code}
                      isUsed={true}
                      onShare={handleShareCode}
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <ShareCodeSheet
        sheetRef={sheetRef}
        code={selectedCode}
        onDismiss={handleSheetDismiss}
      />
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
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
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    marginBottom: theme.spacing.sm,
  },
countBadge: {
    width: 20,
    height: 20,
  alignItems: "center",
  justifyContent: "center",
    borderRadius: 10,
},
  codesGrid: {
    gap: theme.spacing.sm,
  },
  inviteCodeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
  },
  codeContent: {
    flex: 1,
  },
  codeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  codeStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  codeText: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  codeActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetContent: {
    padding: theme.spacing.md,
  },
  sheetHeader: {
    alignItems: "center",
    marginBottom: theme.spacing.lg,
  },
  sheetIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
  sheetTitle: {
    marginBottom: theme.spacing.xs,
  },
  sheetSubtitle: {
    textAlign: "center",
  },
  codeDisplayContainer: {
    alignItems: "center",
    padding: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.lg,
  },
  codeLabel: {
    marginBottom: theme.spacing.sm,
    letterSpacing: 1,
  },
  shareOptions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  shareOption: {
    flex: 1,
    alignItems: "center",
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    gap: theme.spacing.sm,
  },
  shareOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
}));
