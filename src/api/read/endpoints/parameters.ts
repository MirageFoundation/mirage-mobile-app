import * as Sentry from "@sentry/react-native";

import { api } from "../../client";
import type { ParametersResponse, ConfigResponse, NodeConfigResponse } from "../../types";

type ApiErrorLike = {
 code?: unknown;
 response?: {
  status?: unknown;
  data?: {
   error_code?: unknown;
  };
 };
 status?: unknown;
};

export function getSafeApiErrorContext(error: unknown) {
 if (!error || typeof error !== "object") {
  return { hasResponse: false };
 }

 const apiError = error as ApiErrorLike;
 const status = apiError.response?.status ?? apiError.status;
 const errorCode = apiError.response?.data?.error_code ?? apiError.code;

 return {
  status: typeof status === "number" || typeof status === "string" ? status : undefined,
  errorCode: typeof errorCode === "string" ? errorCode : undefined,
  hasResponse: Boolean(apiError.response),
 };
}

export interface GetParametersParams {
 address?: string;
}

export async function getParameters(
 params?: GetParametersParams
): Promise<ParametersResponse> {
 return api.get<ParametersResponse>("/get_parameters", params);
}

/** @deprecated Use getChainConfig instead */
export async function getConfig(): Promise<ConfigResponse> {
 return api.get<ConfigResponse>("/get_chain_config");
}

export async function getChainConfig(): Promise<ConfigResponse> {
 return api.get<ConfigResponse>("/get_chain_config");
}

export async function getNodeConfig(): Promise<NodeConfigResponse> {
 try {
  const response = await api.get<NodeConfigResponse>("/get_node_config");
  const autoEnabledAgentsCount = response.auto_enabled_agents?.length ?? 0;

  if (__DEV__) {
   console.log("[auto-enabled-agents] get_node_config", {
    node_config_auto_enabled_agents: response.auto_enabled_agents ?? [],
   });
  }

  Sentry.addBreadcrumb({
   category: "auto-enabled-agents",
   message: "Node config fetched",
   level: autoEnabledAgentsCount > 0 ? "info" : "warning",
   data: {
    source: "get_node_config",
    hasAutoEnabledAgents: Array.isArray(response.auto_enabled_agents),
    autoEnabledAgentsCount,
   },
  });

  return response;
 } catch (error) {
  Sentry.addBreadcrumb({
   category: "auto-enabled-agents",
   message: "Node config fetch failed",
   level: "error",
   data: {
    source: "get_node_config",
    ...getSafeApiErrorContext(error),
   },
  });
  Sentry.captureException(error, {
   tags: { feature: "auto-enabled-agents", operation: "get-node-config" },
   extra: getSafeApiErrorContext(error),
  });
  throw error;
 }
}
