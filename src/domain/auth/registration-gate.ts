export function canSubmitRegistration(input: {
  registrationEnabled: unknown;
  requestedUsername: string;
  currentUsername: string;
  sameServer: boolean;
  results: readonly { isSuccess: boolean; isFetching: boolean; data?: { exists: boolean } }[];
}): boolean {
  return input.registrationEnabled === true && input.sameServer &&
    input.requestedUsername.length > 0 && input.requestedUsername === input.currentUsername &&
    input.results.length > 0 && input.results.every((result) =>
      result.isSuccess && !result.isFetching && result.data?.exists === false,
    );
}

export function isPrebroadcastRegistrationRejection(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { error_code?: string; tx_hash?: unknown } } })?.response;
  return (response?.status === 400 || response?.status === 403) && !response.data?.tx_hash &&
    ["registration_disabled", "username_required", "username_too_short", "username_too_long", "username_invalid_format"].includes(response.data?.error_code ?? "");
}
