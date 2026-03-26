import {
  type AwardPickerSheetRef,
  type Comment,
  type Post,
} from "@/src/components/molecules";
import { useToast } from "@/src/providers/toast-provider";
import { useSavedPostsStore } from "@/src/stores";
import { useCallback, useRef, useState } from "react";

interface UsePostDetailOverlaysParams {
  currentUserId?: string;
  displayPost: Post | null;
  followedUsers: string[];
  id: string;
  selectedComment: Comment | null;
}

export function usePostDetailOverlays({
  currentUserId,
  displayPost,
  followedUsers,
  id,
  selectedComment,
}: UsePostDetailOverlaysParams) {
  const toast = useToast();
  const savedPosts = useSavedPostsStore((state) => state.savedPosts);
  const savedComments = useSavedPostsStore((state) => state.savedComments);

  const awardPickerSheetRef = useRef<AwardPickerSheetRef>(null);
  const [awardTargetId, setAwardTargetId] = useState<string>("");
  const [awardTargetType, setAwardTargetType] = useState<"post" | "comment">("post");
  const [awardTargetIsOwn, setAwardTargetIsOwn] = useState(false);

  const isOwnComment = currentUserId === selectedComment?.author.id;
  const isFollowingCommentAuthor = selectedComment?.author.id
    ? followedUsers.includes(selectedComment.author.id)
    : false;
  const isCommentSaved = selectedComment
    ? savedComments.some((comment) => comment.id === selectedComment.id)
    : false;
  const isOwnPost = currentUserId === displayPost?.author.id;
  const isFollowingPostAuthor = displayPost?.author.id
    ? followedUsers.includes(displayPost.author.id)
    : false;
  const isPostSaved = displayPost
    ? savedPosts.some((post) => post.id === displayPost.id)
    : false;

  const handleSaveComment = useCallback(() => {
    if (!selectedComment) return;
    const saved = useSavedPostsStore.getState().toggleSaveComment(selectedComment, id);
    toast.success(
      saved ? "Comment saved" : "Comment unsaved",
      saved ? "You can find it in your saved items." : "Removed from saved items.",
    );
  }, [id, selectedComment, toast]);

  const handleSavePost = useCallback(() => {
    if (!displayPost) return;
    const saved = useSavedPostsStore.getState().toggleSavePost(displayPost);
    toast.success(
      saved ? "Post saved" : "Post unsaved",
      saved ? "You can find it in your saved items." : "Removed from saved items.",
    );
  }, [displayPost, toast]);

  const handleGiveCommentAward = useCallback(() => {
    if (!selectedComment) return;
    setAwardTargetId(selectedComment.id);
    setAwardTargetType("comment");
    setAwardTargetIsOwn(currentUserId === selectedComment.author.id);
    setTimeout(() => awardPickerSheetRef.current?.present(), 300);
  }, [currentUserId, selectedComment]);

  const handleGivePostAward = useCallback(() => {
    if (!displayPost) return;
    setAwardTargetId(displayPost.id);
    setAwardTargetType("post");
    setAwardTargetIsOwn(currentUserId === displayPost.author.id);
    setTimeout(() => awardPickerSheetRef.current?.present(), 300);
  }, [currentUserId, displayPost]);

  return {
    awardPickerSheetRef,
    awardTargetId,
    awardTargetIsOwn,
    awardTargetType,
    handleGiveCommentAward,
    handleGivePostAward,
    handleSaveComment,
    handleSavePost,
    isCommentSaved,
    isFollowingCommentAuthor,
    isFollowingPostAuthor,
    isOwnComment,
    isOwnPost,
    isPostSaved,
  };
}
