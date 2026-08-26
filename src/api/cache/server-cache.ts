import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";
import { serverQueryRoot } from "@/src/api/server-runtime";

export function resetNodeConfigCache(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: queryKeys.nodeConfig() });
  queryClient.removeQueries({ queryKey: queryKeys.config() });
}

export function resetServerScopedCache(
  queryClient: QueryClient,
  identity?: string,
): void {
  queryClient.removeQueries({ queryKey: serverQueryRoot(identity) });
}

export async function resetServerScopedCacheAndRefetchConfig(
  queryClient: QueryClient,
): Promise<void> {
  resetServerScopedCache(queryClient);
  await queryClient.invalidateQueries({ queryKey: queryKeys.nodeConfig() });
  await queryClient.invalidateQueries({ queryKey: queryKeys.config() });
}
