import type { AddressFromUsernameResponse } from "../types";

const ANON_USERNAME_PREFIX = "anon-";

export const normalizeUsernameIdentity = (
  username?: string | null,
): string => username?.trim().toLowerCase() ?? "";

export function buildUsernameResolutionCandidates(
  username: string | undefined | null,
): string[] {
  const normalized = normalizeUsernameIdentity(username);
  if (!normalized) return [];

  const anonUsername = normalized.startsWith(ANON_USERNAME_PREFIX)
    ? normalized
    : `${ANON_USERNAME_PREFIX}${normalized}`;
  return Array.from(new Set([normalized, anonUsername]));
}

export function selectUsernameResolution(
  candidates: readonly string[],
  responses: readonly (AddressFromUsernameResponse | undefined)[],
): AddressFromUsernameResponse {
  const match = responses.find((response) => response?.exists);
  return match ?? {
    exists: false,
    address: null,
    username: candidates[0] ?? "",
  };
}
