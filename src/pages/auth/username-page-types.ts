export type UsernameStatus =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "invalid";

export type InviteCodeStatus =
  | "idle"
  | "checking"
  | "valid"
  | "invalid"
  | "used"
  | "expired";

export type ReferralPrecheckStatus = "idle" | "loading" | "valid" | "error";
