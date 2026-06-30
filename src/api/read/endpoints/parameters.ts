import { api } from "../../client";
import type { ParametersResponse, ConfigResponse, NodeConfigResponse } from "../../types";

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
 const response = await api.get<NodeConfigResponse>("/get_node_config");
 if (__DEV__) {
  console.log("[auto-enabled-agents] get_node_config", {
   node_config_auto_enabled_agents: response.auto_enabled_agents ?? [],
  });
 }
 return response;
}
