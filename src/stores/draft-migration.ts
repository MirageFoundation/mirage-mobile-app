import { isValidCommunitySlug } from "@/src/domain/communities";
import {
  EMPTY_POST_DRAFT,
  isClearedPostDraft,
  type Community,
  type PostDraft,
} from "@/src/domain/content";

type LegacyDraft = Partial<PostDraft> & {
  topic?: string | null;
  community?: Community | null;
  isNewTopic?: boolean;
};

function communityFromLegacy(value: unknown): Community | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Community>;
  const id = typeof candidate.id === "string"
    ? candidate.id.trim().toLowerCase()
    : "";
  if (!isValidCommunitySlug(id)) return null;
  return {
    id,
    name: typeof candidate.name === "string" && candidate.name.trim()
      ? candidate.name
      : id,
    ...(typeof candidate.avatar === "string" ? { avatar: candidate.avatar } : {}),
    memberCount: typeof candidate.memberCount === "number" ? candidate.memberCount : 0,
    ...(typeof candidate.description === "string"
      ? { description: candidate.description }
      : {}),
    isSubscribed: Boolean(candidate.isSubscribed),
    ...((candidate.isNewCommunity || (candidate as { isNewTopic?: boolean }).isNewTopic)
      ? { isNewCommunity: true }
      : {}),
  };
}

function communityFromTopic(topic: unknown): Community | null {
  if (typeof topic !== "string") return null;
  const slug = topic.trim().toLowerCase();
  if (!isValidCommunitySlug(slug)) return null;
  return {
    id: slug,
    name: slug,
    memberCount: 0,
    isSubscribed: false,
  };
}

export function migrateDraftStateV0(persistedState: unknown): {
  draft: PostDraft;
  hasDraft: boolean;
} {
  const state = persistedState as { draft?: LegacyDraft; hasDraft?: boolean } | undefined;
  const previous = state?.draft ?? {};
  const { topic: _topic, community: legacyCommunity, ...authored } = previous;
  const community = communityFromLegacy(legacyCommunity)
    ?? communityFromTopic(_topic)
    ?? null;
  const draft: PostDraft = {
    ...EMPTY_POST_DRAFT,
    ...authored,
    community,
    mediaUris: Array.isArray(authored.mediaUris) ? authored.mediaUris : [],
    contentWarning: Array.isArray(authored.contentWarning) ? authored.contentWarning : [],
    tags: Array.isArray(authored.tags) ? authored.tags : [],
  };
  return {
    draft,
    hasDraft: !isClearedPostDraft(draft),
  };
}
