import { Dimensions } from "react-native";

export const ACTION_ICONS: Record<string, string> = {
  comment: "chatbubble-outline",
  vote: "thumbs-up-outline",
  balanced_vote: "swap-vertical-outline",
  post: "create-outline",
  follow: "person-add-outline",
  share: "share-outline",
  upvotes_received: "trending-up-outline",
  comment_upvotes_received: "chatbubbles-outline",
  invite_recruit: "people-outline",
  claim_only: "gift-outline",
};

export const ACTION_COLORS: Record<string, string> = {
  comment: "#3B82F6",
  vote: "#10B981",
  balanced_vote: "#06B6D4",
  post: "#8B5CF6",
  follow: "#F59E0B",
  share: "#EC4899",
  upvotes_received: "#F97316",
  comment_upvotes_received: "#6366F1",
  invite_recruit: "#14B8A6",
  claim_only: "#A855F7",
};

export const BUTTON_GRADIENT_COLORS: readonly [string, string] = [
  "rgb(102, 126, 234)",
  "rgb(118, 75, 162)",
];

export const CONFETTI_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
  "#98D8C8",
  "#F7DC6F",
  "#BB8FCE",
  "#85C1E9",
];

export const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");


export function formatTimeRemaining(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

