import GorhomPopupSheet, {
  type GorhomPopupSheetRef,
} from "@/src/components/ui/gorhom-popup-sheet";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import type { Comment } from "./comment-item";

type CommentOptionsSheetProps = {
  /** The comment to show options for */
  comment?: Comment | null;
  /** Whether the current user is the author */
  isOwnComment?: boolean;
  /** Whether the user is following the comment author */
  isFollowingAuthor?: boolean;
  /** Callback when save is pressed */
  onSave?: () => void;
  /** Callback when copy is pressed */
  onCopy?: () => void;
  /** Callback when follow/unfollow is pressed */
  onToggleFollow?: () => void;
  /** Callback when collapse is pressed */
  onCollapse?: () => void;
  /** Callback when delete is pressed */
  onDelete?: () => void;
  /** Callback when report is pressed */
  onReport?: () => void;
  /** Callback when sheet is dismissed */
  onDismiss?: () => void;
};

export type CommentOptionsSheetRef = {
  present: () => void;
  dismiss: () => void;
};

export const CommentOptionsSheet = forwardRef<
  CommentOptionsSheetRef,
  CommentOptionsSheetProps
>(
  (
    {
      comment,
      isOwnComment = false,
      isFollowingAuthor = false,
      onSave,
      onCopy,
      onToggleFollow,
      onCollapse,
      onDelete,
      onReport,
      onDismiss,
    },
    ref
  ) => {
    const sheetRef = useRef<GorhomPopupSheetRef>(null);

    const present = useCallback(() => {
      sheetRef.current?.present();
    }, []);

    const dismiss = useCallback(() => {
      sheetRef.current?.dismiss();
    }, []);

    useImperativeHandle(ref, () => ({
      present,
      dismiss,
    }));

    const handleSave = useCallback(() => {
      triggerHaptic("medium");
      dismiss();
      onSave?.();
    }, [dismiss, onSave]);

    const handleCopy = useCallback(async () => {
      triggerHaptic("medium");
      if (comment?.content) {
        await Clipboard.setStringAsync(comment.content);
      }
      dismiss();
      onCopy?.();
    }, [dismiss, comment, onCopy]);

    const handleToggleFollow = useCallback(() => {
      triggerHaptic("medium");
      dismiss();
      onToggleFollow?.();
    }, [dismiss, onToggleFollow]);

    const handleCollapse = useCallback(() => {
      triggerHaptic("light");
      dismiss();
      onCollapse?.();
    }, [dismiss, onCollapse]);

    const handleDelete = useCallback(() => {
      triggerHaptic("warning");
      dismiss();
      onDelete?.();
    }, [dismiss, onDelete]);

    const handleReport = useCallback(() => {
      triggerHaptic("warning");
      dismiss();
      onReport?.();
    }, [dismiss, onReport]);

    return (
      <GorhomPopupSheet ref={sheetRef} onDismiss={onDismiss}>
        {/* Save Comment */}
        <GorhomPopupSheet.Item
          icon={Feather}
          iconName="bookmark"
          title="Save Comment"
          onPress={handleSave}
        />

        {/* Copy Text */}
        <GorhomPopupSheet.Item
          icon={Feather}
          iconName="copy"
          title="Copy Text"
          onPress={handleCopy}
        />

        {/* Follow/Unfollow (only for other users' comments) */}
        {!isOwnComment && (
          <GorhomPopupSheet.Item
            icon={Ionicons}
            iconName={
              isFollowingAuthor ? "person-remove-outline" : "person-add-outline"
            }
            title={
              isFollowingAuthor
                ? `Unfollow @${comment?.author.username}`
                : `Follow @${comment?.author.username}`
            }
            onPress={handleToggleFollow}
          />
        )}

        {/* Collapse Thread */}
        <GorhomPopupSheet.Item
          icon={MaterialCommunityIcons}
          iconName="arrow-collapse-vertical"
          title="Collapse Thread"
          onPress={handleCollapse}
        />

        {/* Delete (only for own comments) */}
        {isOwnComment && (
          <GorhomPopupSheet.Item
            icon={Feather}
            iconName="trash-2"
            title="Delete Comment"
            onPress={handleDelete}
          />
        )}

        {/* Report (only for other users' comments) */}
        {!isOwnComment && (
          <GorhomPopupSheet.Item
            icon={Ionicons}
            iconName="flag-outline"
            title="Report Comment"
            onPress={handleReport}
          />
        )}
      </GorhomPopupSheet>
    );
  }
);

CommentOptionsSheet.displayName = "CommentOptionsSheet";
