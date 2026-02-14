import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { getParameters, getConfig, getChainConfig, getNodeConfig } from "../endpoints/parameters";
import { useAuthStore } from "@/src/stores";

export function useParameters() {
 const walletAddress = useAuthStore((s) => s.user?.walletAddress);

 return useQuery({
  queryKey: queryKeys.parameters(walletAddress ?? undefined),
  queryFn: () =>
   getParameters(walletAddress ? { address: walletAddress } : undefined),
  staleTime: 0,
  gcTime: 1000 * 60 * 5,
 });
}

/** @deprecated Use useChainConfig instead */
export function useConfig() {
 return useQuery({
  queryKey: queryKeys.config(),
  queryFn: () => getChainConfig(),
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24,
 });
}

export function useChainConfig() {
 return useQuery({
  queryKey: queryKeys.config(),
  queryFn: () => getChainConfig(),
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24,
 });
}

export function useNodeConfig() {
 return useQuery({
  queryKey: queryKeys.nodeConfig(),
  queryFn: () => getNodeConfig(),
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24,
 });
}
