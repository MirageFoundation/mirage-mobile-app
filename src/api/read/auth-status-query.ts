import type { QueryClient } from "@tanstack/react-query";
import { getUserStatus } from "./endpoints/users";
import { queryKeys } from "./query-keys";
import { shouldRetryApiQuery, assertReadActive } from "../read-retry-policy";

export async function fetchAuthUserStatus(
  queryClient: QueryClient,
  address: string,
  isCurrent: () => boolean,
) {
  return queryClient.fetchQuery({
    queryKey: queryKeys.userStatus(address),
    staleTime: 30_000,
    retry: shouldRetryApiQuery,
    queryFn: async ({ signal }) => {
      const check = () => {
        assertReadActive(signal);
        if (!isCurrent()) throw Object.assign(new Error("Inactive viewer or server"), { code: "ERR_CANCELED" });
      };
      check();
      const response = await getUserStatus({ address }, { signal });
      check();
      return response;
    },
  });
}
