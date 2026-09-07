import { RESERVED_COMMUNITY_SLUGS } from "@/src/domain/communities";

/**
 * `[slug]` in running text (and leftover `c/slug`). Skips markdown `[text](url)`
 * and `[text][ref]`. Used by post markdown and plain community descriptions.
 */
const COMMUNITY_MENTION_RE =
  /(?<![![])\[([a-z0-9]+(?:-[a-z0-9]+)*)\](?![(:\]])|(?<![a-zA-Z0-9/])c\/([a-z0-9]+(?:-[a-z0-9]+)*)(?![a-zA-Z0-9-])/g;

export type CommunityMentionPart =
  | { type: "text"; value: string }
  | { type: "community"; slug: string };

export function splitCommunityMentions(text: string | null | undefined): CommunityMentionPart[] {
  const value = String(text ?? "");
  const regex = new RegExp(COMMUNITY_MENTION_RE.source, COMMUNITY_MENTION_RE.flags);
  const parts: CommunityMentionPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }
    const slug = String(match[1] || match[2] || "").toLowerCase();
    if (!slug || RESERVED_COMMUNITY_SLUGS.has(slug)) {
      const literal = match[0];
      const prev = parts[parts.length - 1];
      if (prev && prev.type === "text") prev.value += literal;
      else parts.push({ type: "text", value: literal });
    } else {
      parts.push({ type: "community", slug });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex === 0) return [{ type: "text", value }];
  if (lastIndex < value.length) {
    const rest = value.slice(lastIndex);
    const prev = parts[parts.length - 1];
    if (prev && prev.type === "text") prev.value += rest;
    else parts.push({ type: "text", value: rest });
  }
  return parts;
}

export function hasCommunityMentions(text: string | null | undefined): boolean {
  return splitCommunityMentions(text).some((part) => part.type === "community");
}
