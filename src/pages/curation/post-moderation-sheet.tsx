import { Modal, Pressable, ScrollView, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/src/components/ui/primitives";
import { ALLOWED_CURATION_TAGS } from "@/src/domain/communities";
import { moderationTagLabel } from "@/src/domain/communities/moderation-action";
import type { ModerationOverlayState } from "@/src/api/read/utils";
import { fullscreenMediaColors } from "@/src/components/molecules/post-actions-appearance";

export function PostModerationMenu({ visible, overlay, teamName, community, pending, syncing, error, readError, loading, canLock, fullscreen, onRetry, onHidePost, onHideAuthor, onLockThread, onSetPostTag, onClearPostTag, onClose }: {
  visible: boolean;
  overlay?: ModerationOverlayState;
  teamName: string;
  community: string;
  pending?: boolean;
  syncing?: boolean;
  error?: string;
  readError?: boolean;
  loading?: boolean;
  canLock?: boolean;
  fullscreen?: boolean;
  onRetry: () => void;
  onHidePost: (hidden: boolean) => void;
  onHideAuthor: (hidden: boolean) => void;
  onLockThread: (locked: boolean) => void;
  onSetPostTag: (tag: string, clear: boolean) => void;
  onClearPostTag: () => void;
  onClose: () => void;
}) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const color = fullscreen ? fullscreenMediaColors.text : theme.colors.text.default;
  const backgroundColor = fullscreen ? fullscreenMediaColors.surface : theme.colors.background.default;
  const disabled = pending || syncing || loading || readError || !overlay;
  const button = (label: string, onPress: () => void, unavailable = disabled) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!unavailable }} disabled={!!unavailable} onPress={onPress} style={{ minHeight: 44, justifyContent: "center", opacity: unavailable ? 0.45 : 1 }}>
      <Text size="sm" style={{ color }}>{label}</Text>
    </Pressable>
  );
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
        <Pressable accessibilityLabel="Close moderation" onPress={onClose} style={{ flex: 1 }} />
        <ScrollView style={{ maxHeight: "80%", backgroundColor, borderTopLeftRadius: 20, borderTopRightRadius: 20 }} contentContainerStyle={{ padding: 20, paddingBottom: Math.max(insets.bottom, 20) }}>
          <Text size="lg" weight="semibold" style={{ color }}>Moderate for {teamName}</Text>
          <Text size="sm" style={{ color }}>[{community}] - Changes this team's lens, not your personal hidden list.</Text>
          {pending ? <Text size="sm" style={{ color }}>Submitting and checking index...</Text> : null}
          {syncing ? <Text size="sm" style={{ color }}>Delivered, still syncing. Do not submit again.</Text> : null}
          {error ? <Text size="sm" style={{ color }} accessibilityRole="alert">{error}</Text> : null}
          {readError ? <Text size="sm" style={{ color }} accessibilityRole="alert">Could not check moderation state. Retry to refresh.</Text> : null}
          {!overlay ? <Text size="sm" style={{ color }}>{loading ? "Loading moderation state..." : "Moderation state unavailable. Retry before making changes."}</Text> : null}
          {(!overlay || syncing || readError) ? button(syncing ? "Check index status" : "Retry moderation state", onRetry, pending || loading) : null}
          {overlay ? <>
            {button(overlay.post_hidden ? "Restore post" : "Hide post for team", () => onHidePost(!overlay.post_hidden))}
            {button(overlay.user_hidden ? "Restore author" : "Hide author for team", () => onHideAuthor(!overlay.user_hidden))}
            {button(overlay.thread_locked ? "Unlock thread" : "Lock thread", () => onLockThread(!overlay.thread_locked), disabled || !canLock)}
            {!canLock ? <Text size="xs" style={{ color }}>Root thread unavailable; locking is disabled.</Text> : null}
            <Text size="sm" weight="semibold" style={{ color }}>Team tag: {moderationTagLabel(overlay.post_tag)}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16 }}>
              {ALLOWED_CURATION_TAGS.map((tag) => <View key={tag || "empty"}>{button(tag || "Set explicit empty tag", () => onSetPostTag(tag, false))}</View>)}
            </View>
            {button("Clear team tag override", onClearPostTag)}
          </> : null}
          {button("Close", onClose, false)}
        </ScrollView>
      </View>
    </Modal>
  );
}
