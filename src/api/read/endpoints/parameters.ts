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
 params?: GetParametersParams,
 options?: { signal?: AbortSignal },
): Promise<ParametersResponse> {
 return api.get<ParametersResponse>("/get_parameters", params, options);
}

/** @deprecated Use getChainConfig instead */
export async function getConfig(): Promise<ConfigResponse> {
 return api.get<ConfigResponse>("/get_chain_config");
}

export async function getChainConfig(options?: { signal?: AbortSignal }): Promise<ConfigResponse> {
 return api.get<ConfigResponse>("/get_chain_config", undefined, options);
}

export async function getNodeConfig(options?: { signal?: AbortSignal }): Promise<NodeConfigResponse> {
  return api.get<NodeConfigResponse>("/get_node_config", undefined, options);
}
