import { api } from "../../client";
import type { ParametersResponse, ConfigResponse } from "../../types";

export interface GetParametersParams {
  address?: string;
}

/**
 * Get latest block hash and PoW difficulty for signing
 * Also returns balance if address is provided
 */
export async function getParameters(
  params?: GetParametersParams
): Promise<ParametersResponse> {
  return api.get<ParametersResponse>("/core/get_parameters", params);
}

/**
 * Get chain configuration, tier info, validator info
 */
export async function getConfig(): Promise<ConfigResponse> {
  return api.get<ConfigResponse>("/core/get_config");
}
