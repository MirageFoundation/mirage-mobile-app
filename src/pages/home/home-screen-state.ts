export type HomeFeedType = "magic" | "latest";

export function getHomeEntryState({
  isLoggedIn,
  isInitializing,
  openBrowsingEnabled,
  isConfigError,
}: {
  isLoggedIn: boolean;
  isInitializing: boolean;
  openBrowsingEnabled: boolean | undefined;
  isConfigError: boolean;
}): "feed" | "welcome" | "loading" | "error" {
  if (isLoggedIn) return "feed";
  if (isInitializing) return "loading";
  if (openBrowsingEnabled === true) return "feed";
  if (openBrowsingEnabled === false) return "welcome";
  return isConfigError ? "error" : "loading";
}

export const HOME_FEED_OPTIONS: { label: string; value: HomeFeedType }[] = [
  { label: "Magic", value: "magic" },
  { label: "Latest", value: "latest" },
];

export function getHomeFeedTabIndex(value: string): number {
  return value === "magic" ? 0 : 1;
}

export function getHomeFeedType(tabIndex: number): HomeFeedType {
  return tabIndex === 0 ? "magic" : "latest";
}

export function getHomeFeedSyncContext(tabIndex: number): string {
  return `home:${getHomeFeedType(tabIndex)}`;
}

export function applyFollowUserOverrides(
  followedUsers: readonly string[],
  overrides: Readonly<Record<string, boolean>>,
): string[] {
  if (Object.keys(overrides).length === 0) return [...followedUsers];

  const result = new Set(followedUsers);
  Object.entries(overrides).forEach(([userId, isFollowing]) => {
    if (isFollowing) result.add(userId);
    else result.delete(userId);
  });
  return Array.from(result);
}

export function getHomeHeaderBorderColor(): string | undefined {
  return undefined;
}
