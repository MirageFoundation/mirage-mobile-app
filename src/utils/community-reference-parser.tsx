import React from "react";
import { Text, type TextStyle } from "react-native";

import { communityPath } from "@/src/domain/communities";
import { handleMirageLink } from "@/src/navigation/linking";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { splitCommunityMentions } from "./community-reference";

export {
  hasCommunityMentions,
  splitCommunityMentions,
  type CommunityMentionPart,
} from "./community-reference";

const COMMUNITY_COLOR = "#3B82F6";

export function openCommunityReference(slug: string): void {
  triggerHaptic("selection");
  void handleMirageLink(communityPath(slug));
}

/**
 * Split text into plain segments and tappable `[slug]` spans that navigate
 * to the community feed. Meant to be rendered inside a parent <Text>.
 */
export function parseCommunityReferences(
  text: string,
  textStyle?: TextStyle,
): React.ReactNode[] {
  return splitCommunityMentions(text).map((part, index) => {
    if (part.type === "text") return part.value;
    return (
      <Text
        key={`community-${part.slug}-${index}`}
        style={[textStyle, { color: COMMUNITY_COLOR }]}
        suppressHighlighting
        onPress={() => openCommunityReference(part.slug)}
      >
        {`[${part.slug}]`}
      </Text>
    );
  });
}
