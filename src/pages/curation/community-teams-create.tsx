import { useCallback, useEffect, useRef } from "react";
import { BackHandler, Keyboard, Pressable, View, useWindowDimensions } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import {
  MAX_CURATION_TEAM_DESCRIPTION_LENGTH,
  MAX_CURATION_TEAM_NAME_LENGTH,
} from "@/src/domain/communities";
import type { useCommunityTeamCreate } from "./use-community-team-create";
import { useTeamCreateSheetPresentation } from "./use-team-create-sheet-presentation";
import { styles } from "./community-teams-styles";

type Creation = ReturnType<typeof useCommunityTeamCreate>;

export function CommunityTeamsCreate({ creation }: { creation: Creation }) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const descriptionInput = useRef<React.ElementRef<typeof BottomSheetTextInput>>(null);
  const { visible, pending, syncing, name, description, close } = creation;
  const { sheet, onChange, onDismiss, focused } = useTeamCreateSheetPresentation(visible, close);
  const locked = pending || syncing;
  const submitDisabled = locked || !name.trim();

  useEffect(() => {
    if (!visible || !focused) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!pending) close();
      return true;
    });
    return () => listener.remove();
  }, [close, focused, pending, visible]);

  const renderBackdrop = useCallback((props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      pressBehavior={pending ? "none" : "close"}
    />
  ), [pending]);

  return (
    <BottomSheetModal
      ref={sheet}
      stackBehavior="replace"
      enableDynamicSizing
      maxDynamicContentSize={height - insets.top - 24}
      topInset={insets.top}
      enablePanDownToClose={!pending}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      enableBlurKeyboardOnGesture
      backdropComponent={renderBackdrop}
      onChange={onChange}
      onDismiss={onDismiss}
      backgroundStyle={{ backgroundColor: theme.colors.background.default }}
      handleIndicatorStyle={{ backgroundColor: theme.colors.border.default }}
    >
      <BottomSheetScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.section, { paddingBottom: insets.bottom + 24 }]}
        accessibilityViewIsModal
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text size="lg" weight="bold" accessibilityRole="header">Create team</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close create team"
            accessibilityState={{ disabled: pending }}
            disabled={pending}
            onPress={close}
            style={{ minHeight: 44, minWidth: 44, justifyContent: "center", opacity: pending ? 0.5 : 1 }}
          >
            <Text size="sm" weight="semibold">Close</Text>
          </Pressable>
        </View>
        <Text size="sm" mode="subtle">Curate this community together with your team.</Text>
        <Text size="sm" weight="semibold">Team name</Text>
        <BottomSheetTextInput
          accessibilityLabel="Team name"
          value={name}
          onChangeText={creation.setName}
          editable={!locked}
          maxLength={MAX_CURATION_TEAM_NAME_LENGTH}
          placeholder="Team name"
          placeholderTextColor={theme.colors.text.subtle}
          returnKeyType="next"
          onSubmitEditing={() => descriptionInput.current?.focus()}
          style={[styles.input, { color: theme.colors.text.default, borderColor: theme.colors.border.default }]}
        />
        <Text size="sm" weight="semibold">Description (optional)</Text>
        <BottomSheetTextInput
          ref={descriptionInput}
          accessibilityLabel="Team description, optional"
          value={description}
          onChangeText={creation.setDescription}
          editable={!locked}
          maxLength={MAX_CURATION_TEAM_DESCRIPTION_LENGTH}
          placeholder="What will your team curate?"
          multiline
          textAlignVertical="top"
          placeholderTextColor={theme.colors.text.subtle}
          style={[styles.input, { color: theme.colors.text.default, borderColor: theme.colors.border.default, minHeight: 96 }]}
        />
        {syncing ? (
          <>
            <Text size="sm" mode="subtle" accessibilityLiveRegion="polite">
              Your team was submitted and is still syncing. Check its status before creating another team.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Check team status"
              accessibilityState={{ disabled: pending, busy: creation.checking }}
              disabled={pending}
              onPress={() => void creation.checkStatus()}
              style={[styles.primaryButton, { backgroundColor: theme.colors.primary[500], minHeight: 44, opacity: pending ? 0.5 : 1 }]}
            >
              <Text size="sm" weight="bold" style={{ color: theme.colors.background.default }}>
                {creation.checking ? "Checking..." : "Check status"}
              </Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create team"
            accessibilityState={{ disabled: submitDisabled, busy: pending }}
            disabled={submitDisabled}
            onPress={() => {
              Keyboard.dismiss();
              creation.handleCreate({ name, description });
            }}
            style={[styles.primaryButton, { backgroundColor: theme.colors.primary[500], minHeight: 44, opacity: submitDisabled ? 0.5 : 1 }]}
          >
            <Text size="sm" weight="bold" style={{ color: theme.colors.background.default }}>
              {pending ? "Creating..." : "Create team"}
            </Text>
          </Pressable>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
