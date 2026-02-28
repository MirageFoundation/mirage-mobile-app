export interface AwardTypeInfo {
  name: string;
  icon: string;
  label: string;
}

export const AWARD_TYPES: Record<string, AwardTypeInfo> = {
  quality_post: { name: "quality_post", icon: "🏆", label: "Quality Post Award" },
  original_content: { name: "original_content", icon: "💡", label: "Original Content Award" },
  based: { name: "based", icon: "💪", label: "Based AF Award" },
  receipts: { name: "receipts", icon: "🏷️", label: "Receipts Award" },
};

export function getAwardInfo(type: string): AwardTypeInfo | undefined {
  return AWARD_TYPES[type];
}

export function formatAwardCost(costUmirage: number): string {
  return `${(costUmirage / 1_000_000).toLocaleString()} MIRAGE`;
}

export function getFriendlyAwardError(message: string): string {
  if (message.includes("already awarded"))
    return "You already gave this post an award.";
  if (message.includes("insufficient") || message.includes("not enough"))
    return "Not enough MIRAGE to give this award.";
  if (message.includes("own post") || message.includes("self-award"))
    return "You can't award your own post.";
  return "Something went wrong. Please try again.";
}
