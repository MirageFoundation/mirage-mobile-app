import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { getParameters, getChainConfig, getNodeConfig } from "../endpoints/parameters";
import { useAuthStore } from "@/src/stores";

export function useParameters() {
 const walletAddress = useAuthStore((s) => s.user?.walletAddress);

 return useQuery({
  queryKey: queryKeys.parameters(walletAddress ?? undefined),
  queryFn: ({ signal }) =>
   getParameters(walletAddress ? { address: walletAddress } : undefined, { signal }),
  staleTime: 0,
  gcTime: 1000 * 60 * 5,
 });
}

/** @deprecated Use useChainConfig instead */
export function useConfig(options?: { enabled?: boolean }) {
 const isInitializing = useAuthStore((s) => s.isInitializing);
 const isBootstrapping = useAuthStore((s) => s.isBootstrapping);

 return useQuery({
  queryKey: queryKeys.config(),
  queryFn: ({ signal }) => getChainConfig({ signal }),
  enabled: !isInitializing && !isBootstrapping && (options?.enabled ?? true),
  staleTime: 1000 * 60 * 60 * 4,
  gcTime: 1000 * 60 * 60 * 24,
 });
}

export function useChainConfig(options?: { enabled?: boolean }) {
 const isInitializing = useAuthStore((s) => s.isInitializing);
 const isBootstrapping = useAuthStore((s) => s.isBootstrapping);

 return useQuery({
  queryKey: queryKeys.config(),
  queryFn: ({ signal }) => getChainConfig({ signal }),
  enabled: !isInitializing && !isBootstrapping && (options?.enabled ?? true),
  staleTime: 1000 * 60 * 60 * 4,
  gcTime: 1000 * 60 * 60 * 24,
 });
}

export function useNodeConfig() {
 const isInitializing = useAuthStore((s) => s.isInitializing);
 const isBootstrapping = useAuthStore((s) => s.isBootstrapping);

 return useQuery({
  queryKey: queryKeys.nodeConfig(),
  queryFn: ({ signal }) => getNodeConfig({ signal }),
  enabled: !isInitializing && !isBootstrapping,
  staleTime: 1000 * 60 * 60 * 24,
  gcTime: 1000 * 60 * 60 * 24,
 });
}
