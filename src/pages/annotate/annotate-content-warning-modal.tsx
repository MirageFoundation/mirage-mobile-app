import { ContentWarningSelectionModal } from "@/src/components/molecules/content-warning-selection-modal";
import type { ContentWarningId } from "@/src/domain/content";
import { getAnnotateContentWarningSelection } from "./content-warning-selection";

type AnnotateContentWarningModalProps = {
  selectedTag: string;
  visible: boolean;
  onClear: () => void;
  onClose: () => void;
  onSelect: (tag: string) => void;
};

export function AnnotateContentWarningModal({
  selectedTag,
  visible,
  onClear,
  onClose,
  onSelect,
}: AnnotateContentWarningModalProps) {
  return (
    <ContentWarningSelectionModal
      visible={visible}
      selectedIds={getAnnotateContentWarningSelection(selectedTag)}
      onToggle={(id: ContentWarningId) => onSelect(id)}
      onClear={onClear}
      onClose={onClose}
      selectionIndicator="check"
    />
  );
}
