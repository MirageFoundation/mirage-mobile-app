import React from "react";
import type { TextStyle } from "react-native";
import { SpoilerText } from "@/src/components/ui/spoiler-text";

const SPOILER_REGEX = /\|\|(.+?)\|\|/g;

export function hasSpoilers(text: string): boolean {
  SPOILER_REGEX.lastIndex = 0;
  return SPOILER_REGEX.test(text);
}

export function parseSpoilers(
  text: string,
  textStyle?: TextStyle,
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const regex = new RegExp(SPOILER_REGEX.source, "g");

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <SpoilerText key={`spoiler-${match.index}`} textStyle={textStyle}>
        {match[1]}
      </SpoilerText>,
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
