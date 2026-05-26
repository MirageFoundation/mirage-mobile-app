import { CommunitySelectionModal } from "@/src/components/molecules/community-selection-modal";
import { DraftDiscardPopup } from "@/src/components/molecules/draft-discard-popup";
import { StickerPicker } from "@/src/components/molecules/sticker-picker";
import { TransactionProgressModal } from "@/src/components/molecules/transaction-progress-modal";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useDraftStore, type Community } from "@/src/stores/draft-store";

import { useCreateComposeState } from "./create-compose-state";
import { ContentWarningModal } from "./content-warning-modal";

type CreateScreenModalsProps = {
  txProgress: any;
  isEditMode: boolean;
  onDismissTransaction: () => void;
  onRetryTransaction: () => void;
  showDraftModal: boolean;
  onSaveDraft: () => void;
  onDiscardDraft: () => void;
  onCancelDraft: () => void;
};

export function CreateScreenModals({
  txProgress,
  isEditMode,
  onDismissTransaction,
  onRetryTransaction,
  showDraftModal,
  onSaveDraft,
  onDiscardDraft,
  onCancelDraft,
}: CreateScreenModalsProps) {
  const selectedCommunity = useDraftStore((state) => state.draft.community);
  const updateDraft = useDraftStore((state) => state.updateDraft);
  const showCommunityModal = useCreateComposeState((state) => state.showCommunityModal);
  const closeCommunityModal = useCreateComposeState((state) => state.closeCommunityModal);
  const showContentWarningModal = useCreateComposeState(
    (state) => state.showContentWarningModal,
  );
  const selectedContentWarning = useCreateComposeState(
    (state) => state.selectedContentWarning,
  );
  const closeContentWarningModal = useCreateComposeState(
    (state) => state.closeContentWarningModal,
  );
  const setSelectedContentWarning = useCreateComposeState(
    (state) => state.setSelectedContentWarning,
  );
  const clearContentWarning = useCreateComposeState((state) => state.clearContentWarning);
  const showStickerPicker = useCreateComposeState((state) => state.showStickerPicker);
  const selectedStickers = useCreateComposeState((state) => state.selectedStickers);
  const closeStickerPicker = useCreateComposeState((state) => state.closeStickerPicker);
  const setSelectedStickers = useCreateComposeState((state) => state.setSelectedStickers);

  const handleCommunitySelect = (community: Community) => {
    updateDraft({ community });
    closeCommunityModal();
    triggerHaptic("selection");
  };

  return (
    <>
      <CommunitySelectionModal
        visible={showCommunityModal}
        onClose={closeCommunityModal}
        onSelect={handleCommunitySelect}
        selectedCommunity={selectedCommunity ?? undefined}
      />

      <ContentWarningModal
        visible={showContentWarningModal}
        selectedContentWarning={selectedContentWarning}
        onClose={closeContentWarningModal}
        onSelect={(warning) => {
          triggerHaptic("selection");
          setSelectedContentWarning(warning);
        }}
        onClear={() => {
          triggerHaptic("selection");
          clearContentWarning();
        }}
      />

      <StickerPicker
        visible={showStickerPicker}
        onClose={closeStickerPicker}
        onSelect={(urls) => setSelectedStickers(urls.length > 0 ? [urls[urls.length - 1]] : [])}
        selectedStickers={selectedStickers}
        multiSelect={false}
      />

      <TransactionProgressModal
        visible={txProgress.isVisible}
        progress={txProgress.progress}
        title={isEditMode ? "Editing Post" : "Creating Post"}
        description={
          isEditMode
            ? "Your edit is being published to the blockchain"
            : "Your post is being published to the blockchain"
        }
        onDismiss={onDismissTransaction}
        onRetry={onRetryTransaction}
        autoDismissDelay={500}
      />

      <DraftDiscardPopup
        visible={showDraftModal}
        onSaveDraft={onSaveDraft}
        onDiscard={onDiscardDraft}
        onCancel={onCancelDraft}
      />
    </>
  );
}
