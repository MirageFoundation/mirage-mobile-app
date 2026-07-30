export type InboxQueryParamsInput = {
  limit?: number;
};

export type InboxQueryParams = Readonly<{
  limit: number;
}>;

export const normalizeInboxQueryParams = (
  params?: InboxQueryParamsInput,
): InboxQueryParams => ({
  limit: Math.min(100, Math.max(1, Math.trunc(params?.limit ?? 25))),
});

export type UserPostsQueryParamsInput = {
  type?: "" | "submissions" | "comments";
  limit?: number;
  allowed_tags?: string;
};

export type UserPostsQueryParams = Readonly<{
  type: "" | "submissions" | "comments";
  limit: number;
  allowed_tags: string;
}>;

const normalizeAllowedTags = (allowedTags: string | undefined): string => {
  if (allowedTags === undefined) return "sensitive";
  return [...new Set(
    allowedTags
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean),
  )].sort().join(",");
};

export const normalizeUserPostsQueryParams = (
  params?: UserPostsQueryParamsInput,
): UserPostsQueryParams => ({
  type: params?.type ?? "",
  limit: Math.min(50, Math.max(1, Math.trunc(params?.limit ?? 10))),
  allowed_tags: normalizeAllowedTags(params?.allowed_tags),
});
