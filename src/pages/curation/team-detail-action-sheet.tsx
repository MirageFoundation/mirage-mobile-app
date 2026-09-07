import { useCallback, useEffect } from "react";
import { BackHandler, Keyboard, Pressable, View, useWindowDimensions } from "react-native";
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, type BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";
import { Text } from "@/src/components/ui/primitives";
import type { CurationTeamDetail, TeamInvitation } from "@/src/domain/communities";
import { TeamDetailActionFields } from "./team-detail-action-fields";
import { TEAM_ACTION_TITLES, teamActionValidation } from "./team-detail-action-model";
import type { TeamDetailActions } from "./use-team-detail-actions";
import { useTeamCreateSheetPresentation } from "./use-team-create-sheet-presentation";
import { styles } from "./community-teams-styles";

export function TeamDetailActionSheet({ detail, actions, invitations }: { detail: CurationTeamDetail; actions: TeamDetailActions; invitations: TeamInvitation[] }) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { visible, pending, action, close, syncing } = actions;
  const dismissBlocked = pending && !actions.resolvingTarget;
  const { sheet, onChange, onDismiss, focused } = useTeamCreateSheetPresentation(visible, close);
  useEffect(() => {
    if (!visible || !focused) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => { if (!dismissBlocked) close(); return true; });
    return () => listener.remove();
  }, [close, focused, dismissBlocked, visible]);
  const backdrop = useCallback((props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior={dismissBlocked ? "none" : "close"} />
  ), [dismissBlocked]);
  const destructive = action != null && ["delete", "transfer", "leave", "remove", "revoke"].includes(action);
  const invalid = action ? teamActionValidation(action, actions.draft, detail, invitations) : null;
  const disabled = syncing ? pending : actions.locked || !!invalid;
  const actionLabel = action === "profile" || action === "audience" || action === "tag" ? "Save changes" : action ? TEAM_ACTION_TITLES[action] : "Save changes";
  return (
    <BottomSheetModal ref={sheet} stackBehavior="replace" enableDynamicSizing maxDynamicContentSize={height - insets.top - 24}
      topInset={insets.top} enablePanDownToClose={!dismissBlocked} backdropComponent={backdrop} onChange={onChange} onDismiss={onDismiss}
      keyboardBehavior="interactive" keyboardBlurBehavior="restore" android_keyboardInputMode="adjustResize" enableBlurKeyboardOnGesture
      backgroundStyle={{ backgroundColor: theme.colors.background.default }} handleIndicatorStyle={{ backgroundColor: theme.colors.border.default }}>
      <BottomSheetScrollView keyboardShouldPersistTaps="handled" accessibilityViewIsModal
        contentContainerStyle={[styles.section, { paddingBottom: insets.bottom + 24, gap: 16 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Text size="lg" weight="bold" accessibilityRole="header" style={{ flex: 1 }}>{action ? TEAM_ACTION_TITLES[action] : "Team settings"}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close team action" accessibilityState={{ disabled: dismissBlocked }}
            disabled={dismissBlocked} onPress={close} style={{ minWidth: 44, minHeight: 44, justifyContent: "center", opacity: dismissBlocked ? 0.5 : 1 }}>
            <Text size="sm" weight="semibold">Close</Text>
          </Pressable>
        </View>
        <TeamDetailActionFields detail={detail} actions={actions} />
        {syncing ? <Text size="sm" mode="subtle" accessibilityLiveRegion="polite">Your change was submitted and is still syncing. Check its status before making another change.</Text> : null}
        {action && action !== "advanced" ? (
          <Pressable accessibilityRole="button" accessibilityLabel={syncing ? "Check change status" : actionLabel}
            accessibilityState={{ disabled, busy: pending }} disabled={disabled}
            onPress={() => { Keyboard.dismiss(); if (syncing) void actions.checkStatus(); else actions.submit(); }}
            style={[styles.primaryButton, { minHeight: 44, backgroundColor: destructive && !syncing ? theme.colors.error[500] : theme.colors.primary[500], opacity: disabled ? 0.5 : 1 }]}>
            <Text size="sm" weight="bold" style={{ color: theme.colors.background.default }}>{pending ? "Please wait..." : syncing ? "Check status" : actionLabel}</Text>
          </Pressable>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
