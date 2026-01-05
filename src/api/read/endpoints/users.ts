import { api } from "../../client";
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
 * Get user's followed users, topics, and moderators
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

/**
 * Bulk resolve addresses to usernames
 */
export async function bulkGetUsernameFromAddress(
  addresses: string[]
): Promise<UsernameFromAddressResponse[]> {
  return api.post<UsernameFromAddressResponse[]>(
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
