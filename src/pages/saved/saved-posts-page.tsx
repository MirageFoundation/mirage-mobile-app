import { ModerationProvider } from "@/src/features/moderation/moderation-provider";
import { SavedPostsScreen as SavedPostsContent } from "./saved-posts-content";

export function SavedPostsScreen() {
  return <ModerationProvider><SavedPostsContent /></ModerationProvider>;
}
