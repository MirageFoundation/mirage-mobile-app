import { api } from "@/src/api/client";

export interface AgentInfo {
  address: string;
  username: string;
  biography: string;
  avatar: string;
  last_active: number | null;
}

export interface AgentsResponse {
  agents: AgentInfo[];
}

export async function getAgents(): Promise<AgentsResponse> {
  return api.get<AgentsResponse>("/get_agents");
}
