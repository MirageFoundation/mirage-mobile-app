import { api, apiClient } from "../../client";
import * as Sentry from "@sentry/react-native";
import type {
  UserStatusResponse,
  ProfileResponse,
  UserFollowedResponse,
  UserBlockedResponse,
  PreferencesResponse,
  SimilarUsersResponse,
  UsersResponse,
  AddressFromUsernameResponse,
  UsernameFromAddressResponse,
  ValidateInviteCodeResponse,
  GetInviteCodesResponse,
} from "../../types";

// ============================================
// User Status & Profile
// ============================================

export interface GetUserStatusParams {
  address: string;
}

/**
 * Get user tier, balance, subscription status, recent votes
 */
export async function getUserStatus(
  params: GetUserStatusParams
): Promise<UserStatusResponse> {
  return api.get<UserStatusResponse>("/get_user_status", params);
}

export interface GetProfileParams {
  address: string;
}

/**
 * Get full profile with all lists
 */
export async function getProfile(
  params: GetProfileParams
): Promise<ProfileResponse> {
  return api.get<ProfileResponse>("/get_profile", params);
}

// ============================================
// User Lists
// ============================================

export interface GetUserFollowedParams {
  address: string;
}

/**
 * Get user's followed users, topics, and enabled agents
 */
export async function getUserFollowed(
  params: GetUserFollowedParams
): Promise<UserFollowedResponse> {
  return api.get<UserFollowedResponse>("/get_user_followed", params);
}

export interface GetUserBlockedParams {
  address: string;
}

/**
 * Get user's blocked users and posts
 */
export async function getUserBlocked(
  params: GetUserBlockedParams
): Promise<UserBlockedResponse> {
  return api.get<UserBlockedResponse>("/get_user_blocked", params);
}

// ============================================
// User Preferences & Recommendations
// ============================================

export interface GetPreferencesParams {
  address: string;
}

/**
 * Get user's personalized topic and author weights
 */
export async function getPreferences(
  params: GetPreferencesParams
): Promise<PreferencesResponse> {
  return api.get<PreferencesResponse>("/get_preferences", params);
}

export interface GetSimilarUsersParams {
  address: string;
}

/**
 * Get users similar to the given address
 */
export async function getSimilarUsers(
  params: GetSimilarUsersParams
): Promise<SimilarUsersResponse> {
  return api.get<SimilarUsersResponse>("/get_similar_users", params);
}

// ============================================
// Username/Address Resolution
// ============================================

export interface GetAddressFromUsernameParams {
  username: string;
}

/**
 * Resolve username to address
 */
export async function getAddressFromUsername(
  params: GetAddressFromUsernameParams
): Promise<AddressFromUsernameResponse> {
  return api.get<AddressFromUsernameResponse>(
    "/get_address_from_username",
    params
  );
}

export interface GetUsernameFromAddressParams {
  address: string;
}

/**
 * Resolve address to username
 */
export async function getUsernameFromAddress(
  params: GetUsernameFromAddressParams
): Promise<UsernameFromAddressResponse> {
  return api.get<UsernameFromAddressResponse>(
    "/get_username_from_address",
    params
  );
}

// ============================================
// Bulk Resolution (POST)
// ============================================

/**
 * Bulk resolve usernames to addresses
 */
export async function bulkGetAddressFromUsername(
  usernames: string[]
): Promise<AddressFromUsernameResponse[]> {
  return api.post<AddressFromUsernameResponse[]>(
    "/get_address_from_username",
    { usernames }
  );
}

export interface BulkUsernameMapResponse {
  map: Record<string, string>;
}

/**
 * Bulk resolve addresses to usernames
 * Returns { map: { address: username } }
 */
export async function bulkGetUsernameFromAddress(
  addresses: string[]
): Promise<BulkUsernameMapResponse> {
  return api.post<BulkUsernameMapResponse>(
    "/get_username_from_address",
    { addresses }
  );
}

// ============================================
// User List
// ============================================

export interface GetUsersParams {
  limit?: number; // max 500
  page?: number;
  has_username?: boolean;
}

/**
 * Get paginated list of users
 */
export async function getUsers(
  params?: GetUsersParams
): Promise<UsersResponse> {
  return api.get<UsersResponse>("/get_users", params);
}

// ============================================
// Invite Code Validation
// ============================================

export interface GetInviteCodesParams {
 address: string;
}

export async function getInviteCodes(
 params: GetInviteCodesParams
): Promise<GetInviteCodesResponse> {
  return api.get<GetInviteCodesResponse>("/get_invite_codes", params);
}

export interface ValidateInviteCodeParams {
  code: string;
}

export async function validateInviteCode(
  params: ValidateInviteCodeParams
): Promise<ValidateInviteCodeResponse> {
  const trimmed = params.code.trim();
  const isValidFormat = /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(trimmed);
  console.log("[validateInviteCode] code:", JSON.stringify(trimmed), "isValidFormat:", isValidFormat);
  if (!isValidFormat) {
    return { valid: false, code: trimmed, error: "invalid_code" };
  }

  try {
    const response = await apiClient.getInstance().post<ValidateInviteCodeResponse>("/api/validate_invite_code", { code: trimmed });
    console.log("[validateInviteCode] server response:", JSON.stringify(response.data));
    return response.data;
  } catch (error: any) {
    const status = error?.response?.status;
    Sentry.addBreadcrumb({ category: "invite-code", message: "validateInviteCode failed", data: { status, error: error?.message }, level: "warning" });
    if (status === 404 || status === 405) {
      return { valid: true, code: trimmed };
    }
    return { valid: false, code: trimmed, error: "invalid_code" as const };
  }
}
