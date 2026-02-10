import { useQuery } from "@tanstack/react-query";
import { validateInviteCode } from "../endpoints/users";
import { queryKeys } from "../query-keys";

export function useValidateInviteCode(code: string | null) {
  const trimmed = code?.trim() ?? "";
  const isEnabled = trimmed.length >= 3;

  return useQuery({
    queryKey: queryKeys.inviteCode(trimmed),
    queryFn: () => validateInviteCode({ code: trimmed }),
    enabled: isEnabled,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    retry: false,
  });
}
