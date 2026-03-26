import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { queryKeys } from "@/src/api/read/query-keys";

const SERVER_SCOPED_QUERY_PREFIXES: QueryKey[] = [
  queryKeys.parametersRoot(),
  queryKeys.config(),
  queryKeys.nodeConfig(),
  queryKeys.userRoot(),
  queryKeys.usersRoot(),
  queryKeys.postsRoot(),
  queryKeys.commentsRoot(),
  queryKeys.rootPostIdRoot(),
  queryKeys.commentContextRoot(),
  queryKeys.inboxRoot(),
  queryKeys.topicsRoot(),
  queryKeys.searchRoot(),
  queryKeys.resolveRoot(),
  queryKeys.txRoot(),
  queryKeys.statsRoot(),
  queryKeys.leaderboardRoot(),
  queryKeys.referralRoot(),
  queryKeys.peers(),
  queryKeys.inviteCodeRoot(),
  queryKeys.inviteCodesRoot(),
  queryKeys.rewardsRoot(),
  queryKeys.agents(),
];

export function clearServerScopedQueries(queryClient: QueryClient) {
  SERVER_SCOPED_QUERY_PREFIXES.forEach((queryKey) => {
    queryClient.removeQueries({ queryKey });
  });
}
