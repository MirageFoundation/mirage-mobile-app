const SAFE_REASONS = new Set([
  "transaction rejected",
  "team not found",
  "only the team owner may invite",
  "team owner is already a curator",
  "invitee must be an active subscriber or admin",
  "invitee already curates in this community",
  "invitation already pending",
  "team is full",
  "too many pending invites for this team",
  "accepted curators plus pending invitations reached team capacity",
  "too many pending invites for this user",
]);

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function writeFailureDiagnostics(path: string, error: unknown) {
  const response = record(record(error).response);
  const body = record(response.data);
  const details = record(body.details);
  const nestedError = record(body.error);
  const code = body.error_code ?? details.error_code ?? nestedError.error_code;
  const hash = body.tx_hash ?? body.txhash ?? details.tx_hash;
  const reason = [body.reason, details.reason, nestedError.reason, body.error]
    .find(value => typeof value === "string" && SAFE_REASONS.has(value));
  return {
    path: /^\/core\/[a-z_]+$/.test(path) ? path : "/core/unknown",
    ...(typeof response.status === "number" ? { http_status: response.status } : {}),
    ...(typeof code === "string" && code.length <= 64 && /^[a-z]+(?:_[a-z0-9]+)+$/.test(code) ? { error_code: code } : {}),
    ...(typeof body.code === "number" ? { chain_code: body.code } : {}),
    ...(typeof hash === "string" && /^[a-fA-F0-9]{64}$/.test(hash) ? { tx_hash: hash } : {}),
    ...(typeof reason === "string" ? { reason } : {}),
  };
}
