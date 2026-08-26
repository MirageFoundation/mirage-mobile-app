import type { ContentTag } from "@/src/api/write/endpoints/posts";
import { ContentWarningSelectionModal } from "@/src/components/molecules/content-warning-selection-modal";
import type { ContentWarningId } from "@/src/domain/content";
import { getCreateContentWarningSelection } from "./content-warning-selection";

type ContentWarningModalProps = {
  visible: boolean;
  selectedContentWarning: ContentTag | "";
  onClose: () => void;
  onSelect: (warning: ContentTag) => void;
  onClear: () => void;
};

export function ContentWarningModal({
  visible,
  selectedContentWarning,
  onClose,
  onSelect,
  onClear,
}: ContentWarningModalProps) {
  return (
    <ContentWarningSelectionModal
      visible={visible}
      selectedIds={getCreateContentWarningSelection(selectedContentWarning)}
      onToggle={(id: ContentWarningId) => onSelect(id)}
      onClear={onClear}
      onClose={onClose}
      selectionIndicator="dot"
    />
  );
}
