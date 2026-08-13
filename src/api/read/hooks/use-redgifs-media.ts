import { useQuery } from "@tanstack/react-query";

import { getRedgifsMedia } from "../endpoints/redgifs";
import { queryKeys } from "../query-keys";

export function useRedgifsMedia(id?: string | null) {
  return useQuery({
    queryKey: queryKeys.redgifsMedia(id ?? ""),
    queryFn: ({ signal }) => getRedgifsMedia(id!, signal),
    enabled: !!id,
    staleTime: 1000 * 60 * 60 * 12,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 2,
  });
}
