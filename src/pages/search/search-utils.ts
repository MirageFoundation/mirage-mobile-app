import { Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type SearchTab = "posts" | "topics" | "users";

export const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const getTopicIcon = (
  topic: string,
): { icon: keyof typeof Ionicons.glyphMap; color: string } => {
  const lowerTopic = topic.toLowerCase();

  if (lowerTopic.includes("bitcoin") || lowerTopic.includes("btc")) {
    return { icon: "logo-bitcoin", color: "#F7931A" };
  }
  if (
    lowerTopic.includes("crypto") ||
    lowerTopic.includes("eth") ||
    lowerTopic.includes("defi")
  ) {
    return { icon: "wallet", color: "#627EEA" };
  }
  if (
    lowerTopic.includes("ai") ||
    lowerTopic.includes("artificial") ||
    lowerTopic.includes("machine")
  ) {
    return { icon: "sparkles", color: "#8B5CF6" };
  }
  if (
    lowerTopic.includes("game") ||
    lowerTopic.includes("gaming") ||
    lowerTopic.includes("esport")
  ) {
    return { icon: "game-controller", color: "#10B981" };
  }
  if (
    lowerTopic.includes("space") ||
    lowerTopic.includes("rocket") ||
    lowerTopic.includes("nasa")
  ) {
    return { icon: "rocket", color: "#3B82F6" };
  }
  if (
    lowerTopic.includes("sport") ||
    lowerTopic.includes("football") ||
    lowerTopic.includes("soccer")
  ) {
    return { icon: "football", color: "#EF4444" };
  }
  if (
    lowerTopic.includes("music") ||
    lowerTopic.includes("song") ||
    lowerTopic.includes("album")
  ) {
    return { icon: "musical-notes", color: "#EC4899" };
  }
  if (
    lowerTopic.includes("movie") ||
    lowerTopic.includes("film") ||
    lowerTopic.includes("cinema")
  ) {
    return { icon: "film", color: "#F59E0B" };
  }
  if (
    lowerTopic.includes("tech") ||
    lowerTopic.includes("code") ||
    lowerTopic.includes("programming")
  ) {
    return { icon: "code-slash", color: "#06B6D4" };
  }
  if (
    lowerTopic.includes("news") ||
    lowerTopic.includes("politics") ||
    lowerTopic.includes("world")
  ) {
    return { icon: "newspaper", color: "#64748B" };
  }
  if (
    lowerTopic.includes("science") ||
    lowerTopic.includes("research") ||
    lowerTopic.includes("study")
  ) {
    return { icon: "flask", color: "#14B8A6" };
  }
  if (
    lowerTopic.includes("art") ||
    lowerTopic.includes("design") ||
    lowerTopic.includes("creative")
  ) {
    return { icon: "color-palette", color: "#F472B6" };
  }
  if (
    lowerTopic.includes("food") ||
    lowerTopic.includes("cook") ||
    lowerTopic.includes("recipe")
  ) {
    return { icon: "restaurant", color: "#FB923C" };
  }
  if (
    lowerTopic.includes("health") ||
    lowerTopic.includes("fitness") ||
    lowerTopic.includes("workout")
  ) {
    return { icon: "fitness", color: "#22C55E" };
  }
  if (
    lowerTopic.includes("travel") ||
    lowerTopic.includes("trip") ||
    lowerTopic.includes("vacation")
  ) {
    return { icon: "airplane", color: "#0EA5E9" };
  }

  return { icon: "chatbubble", color: "#6366F1" };
};

export const formatPostCount = (count?: number): string => {
  if (!count) return "";
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M posts`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K posts`;
  }
  return `${count} posts`;
};

export const formatCount = (
  count: number,
  singular: string,
  plural: string,
): string => {
  if (count === 1) {
    return `${count} ${singular}`;
  }
  return `${count} ${plural}`;
};
