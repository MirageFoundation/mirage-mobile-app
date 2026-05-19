import { MentionSuggestions } from "@/src/components/molecules/mention-suggestions";
import { triggerHaptic } from "@/src/components/utils/haptics";
import type { AttachmentType } from "@/src/domain/content";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useDraftStore } from "@/src/stores/draft-store";
import { useCreateComposeState } from "./create-compose-state";
import { CreateMediaToolbar } from "./create-media-toolbar";

type CreateComposeAccessoriesProps = {
  mentionOpen: boolean;
  mentionLoading: boolean;
  mentionResults: any[];
  mentionQuery: string;
  keyboardVisible: boolean;
  editExpired: boolean;
  tabBarHeight: number;
  hasAttachment: boolean;
  attachmentType: AttachmentType;
  bodySelectionRef: MutableRefObject<{ start: number; end: number }>;
  setBodySelection: Dispatch<SetStateAction<{ start: number; end: number } | undefined>>;
  onCloseMention: () => void;
  insertMention: (
    username: string,
    text: string,
    cursorPosition: number,
  ) => { newText: string; newCursorPos: number };
  onImagePress: () => void;
  onVideoPress: () => void;
  onSpoilerPress: () => void;
};

export function CreateComposeAccessories({
  mentionOpen,
  mentionLoading,
  mentionResults,
  mentionQuery,
  keyboardVisible,
  editExpired,
  tabBarHeight,
  hasAttachment,
  attachmentType,
  bodySelectionRef,
  setBodySelection,
  onCloseMention,
  insertMention,
  onImagePress,
  onVideoPress,
  onSpoilerPress,
}: CreateComposeAccessoriesProps) {
  const updateDraft = useDraftStore((state) => state.updateDraft);
  const openLinkInput = useCreateComposeState((state) => state.openLinkInput);
  const openStickerPicker = useCreateComposeState((state) => state.openStickerPicker);

  const handleLinkPress = () => {
    triggerHaptic("selection");
    openLinkInput();
  };

  const handleStickerPress = () => {
    triggerHaptic("selection");
    openStickerPicker();
  };

  const handleSelectMention = (username: string) => {
    const cursorPos = bodySelectionRef.current.start;
    const { newText, newCursorPos } = insertMention(
      username,
      useDraftStore.getState().draft.body,
      cursorPos,
    );
    updateDraft({ body: newText });
    setBodySelection({ start: newCursorPos, end: newCursorPos });
    setTimeout(() => setBodySelection(undefined), 50);
  };

  return (
    <>
      <MentionSuggestions
        visible={mentionOpen}
        loading={mentionLoading}
        results={mentionResults}
        query={mentionQuery}
        onClose={onCloseMention}
        onSelect={handleSelectMention}
      />

      {!mentionOpen && (
        <CreateMediaToolbar
          keyboardVisible={keyboardVisible}
          editExpired={editExpired}
          tabBarHeight={tabBarHeight}
          hasAttachment={hasAttachment}
          attachmentType={attachmentType}
          onLinkPress={handleLinkPress}
          onImagePress={onImagePress}
          onVideoPress={onVideoPress}
          onStickerPress={handleStickerPress}
          onSpoilerPress={onSpoilerPress}
        />
      )}
    </>
  );
}
