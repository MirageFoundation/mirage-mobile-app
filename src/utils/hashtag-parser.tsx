import React from "react";
import { Text, type TextStyle } from "react-native";

import { handleMirageLink } from "@/src/navigation/linking";
import { triggerHaptic } from "@/src/components/utils/haptics";

// Word-boundary hashtags: start of string or whitespace, then #tag.
// Tag chars: letters, numbers, underscore, hyphen (matches topic slugs).
const HASHTAG_REGEX = /(^|\s)#([\p{L}\p{N}_-]+)/gu;

const HASHTAG_COLOR = "#3B82F6";

export function hasHashtags(text: string): boolean {
  HASHTAG_REGEX.lastIndex = 0;
  return HASHTAG_REGEX.test(text);
}

export function openHashtagTopic(tag: string): void {
  triggerHaptic("selection");
  void handleMirageLink(`/topic/${encodeURIComponent(tag)}`);
}

/**
 * Split text into plain segments and tappable #hashtag spans that navigate
 * to the topic feed (BUG-021). Meant to be rendered inside a parent <Text>.
 */
export function parseHashtags(
  text: string,
  textStyle?: TextStyle,
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const regex = new RegExp(HASHTAG_REGEX.source, "gu");

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const leading = match[1];
    const tag = match[2];
    const hashStart = match.index + leading.length;
    if (hashStart > lastIndex) {
      parts.push(text.slice(lastIndex, hashStart));
    }
    parts.push(
      <Text
        key={`hashtag-${hashStart}`}
        style={[textStyle, { color: HASHTAG_COLOR }]}
        suppressHighlighting
        onPress={() => openHashtagTopic(tag)}
      >
        {`#${tag}`}
      </Text>,
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
