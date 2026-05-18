import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";

export function resetNodeConfigCache(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: queryKeys.nodeConfig() });
  queryClient.removeQueries({ queryKey: queryKeys.config() });
}

export function resetServerScopedCache(queryClient: QueryClient): void {
  resetNodeConfigCache(queryClient);
  queryClient.removeQueries({ queryKey: queryKeys.postsRoot() });
  queryClient.removeQueries({ queryKey: queryKeys.commentsRoot() });
  queryClient.removeQueries({ queryKey: queryKeys.topicsRoot() });
  queryClient.removeQueries({ queryKey: queryKeys.peers() });
  queryClient.removeQueries({ queryKey: queryKeys.networkStats() });
  queryClient.removeQueries({ queryKey: queryKeys.circulationStats() });
  queryClient.removeQueries({ queryKey: queryKeys.appStats() });
  queryClient.removeQueries({ queryKey: queryKeys.welcomeStats() });
}

export async function resetServerScopedCacheAndRefetchConfig(
  queryClient: QueryClient,
): Promise<void> {
  resetServerScopedCache(queryClient);
  await queryClient.invalidateQueries({ queryKey: queryKeys.nodeConfig() });
  await queryClient.invalidateQueries({ queryKey: queryKeys.config() });
}
