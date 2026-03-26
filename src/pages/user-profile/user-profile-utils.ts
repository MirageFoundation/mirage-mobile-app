import type { Post as ApiPost } from "@/src/api/types";
import type { Post } from "@/src/components/molecules";
import { Dimensions } from "react-native";

export const { width: USER_PROFILE_SCREEN_WIDTH } = Dimensions.get("window");
export const USER_PROFILE_HEADER_BAR_HEIGHT = 56;

export type UserProfileListItem = Post | ApiPost | "header" | "tabs";

export const formatMirageBalance = (umirage: number): number => {
  return Math.floor(umirage / 1_000_000);
};

export const calculateAccountAgeDays = (
  createdAt: number | null | undefined,
): number => {
  if (!createdAt) return 0;
  const now = Date.now() / 1000;
  const ageInSeconds = now - createdAt;
  return ageInSeconds / (60 * 60 * 24);
};
