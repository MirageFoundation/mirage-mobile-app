const ERROR_MESSAGES: Record<string, string> = {
 registration_disabled: "Registration is currently disabled on this node.",
 invite_code_required: "An invite code is required to create an account.",
 invite_code_invalid: "That invite code is not valid.",
 invite_code_used: "That invite code has already been used.",
 invite_code_check_failed: "Could not validate the invite code. Please try again.",
 invite_code_invalid_format: "Invite code format is invalid.",
 invite_codes_not_required: "Invite codes are not required on this node.",
 invite_codes_main_site_only: "Invite codes only work on mirage.talk.",

 username_required: "A username is required.",
 username_too_short: "Your username is too short.",
 username_too_long: "Your username is too long.",
 username_invalid_format: "Usernames can only contain letters, numbers, and hyphens.",

 referral_requires_invite_codes: "Referral links require invite codes to be enabled.",
 referrer_not_found: "Referrer not found.",
 referrer_not_opted_in: "This referrer has not enabled referral links.",
 referrer_no_codes: "This referrer has no invite codes left.",
 referrer_already_used: "You already used this referrer.",
 referrer_username_too_long: "Referrer username is too long.",
 referrer_username_invalid_format: "Invalid referrer username format.",
 referrer_check_failed: "Could not validate the referrer. Please try again.",
 self_referral: "You cannot refer yourself.",

 missing_fields: "Missing required fields.",
 invalid_pubkey: "Invalid public key.",
 invalid_signature: "Invalid signature.",
 invalid_timestamp: "Invalid timestamp.",
 timestamp_required: "Timestamp is required.",
 timestamp_must_be_millis: "Timestamp must be in milliseconds.",
 timestamp_outside_window: "Timestamp is outside the allowed window. Check device clock.",
 invalid_nonce: "Invalid envelope nonce.",
 nonce_required: "Envelope nonce is required.",
 nonce_must_be_positive: "Envelope nonce must be positive.",
 nonce_out_of_range: "Envelope nonce exceeds allowed range.",
 nonce_replayed: "This request has already been processed.",
 invalid_relay_fields: "Invalid relay fields.",
 invalid_owner: "Invalid owner.",
 address_mismatch: "Address does not match the provided key.",
 address_required: "Address is required.",
 control_characters: "Fields contain invalid control characters.",
 forbidden: "You do not have permission to perform this action.",
 unauthorized: "Unauthorized.",
 enabled_must_be_boolean: "Enabled must be a boolean value.",
 owner_required: "Owner is required.",

 node_catching_up: "The node is syncing. Please try again shortly.",
 backend_not_initialized: "The server is starting up. Please try again shortly.",
 indexer_unavailable: "Data service is temporarily unavailable.",
 internal_error: "Something went wrong. Please try again.",
 debug_localhost_only: "Debug endpoints are only available on localhost.",

 pow_required: "Proof-of-work is required.",
 insufficient_pow_precheck: "Proof-of-work is insufficient. Please try again.",
 pow_not_allowed_agents: "Proof-of-work is not allowed for agents.",
 pow_not_allowed_for_award: "Proof-of-work is not allowed for awards.",
 pow_not_allowed_for_set_auto_renewal: "Proof-of-work is not allowed for auto-renewal.",
 pow_not_allowed_for_subscribers: "Proof-of-work is not allowed for subscribers.",
 invalid_pow_fields: "Invalid proof-of-work fields.",
 invalid_last_block_hash: "Invalid last block hash.",

 title_too_long: "Your title exceeds the maximum length.",
 content_too_long: "Your post exceeds the maximum length.",
 topic_too_short: "Topic name is too short.",
 topic_too_long: "Topic name is too long.",
 topic_invalid_format: "Topic name contains invalid characters.",
 topic_required: "A topic is required for new posts.",
 comment_content_required: "Comment text is required.",
 comment_not_found: "Comment not found.",
 comment_must_not_include_topic: "Comments must not include a topic.",
 post_not_found: "Post not found.",
 invalid_target: "Invalid target.",
 invalid_target_format: "Invalid target format.",
 target_not_found: "The target post or comment was not found.",
 target_mismatch: "Cannot change the parent of an existing post.",
 target_must_be_mirage1: "Target must be a valid mirage1 address.",
 tag_too_long: "Tag is too long.",
 invalid_tag: "Invalid tag.",
 invalid_override: "Invalid override.",
 post_id_required: "Post ID is required.",
 comment_id_required: "Comment ID is required.",
 invalid_hash: "Invalid or missing hash.",

 media_not_list: "Media must be provided as a list.",
 media_limit_exceeded: "Too many media attachments.",
 media_item_too_long: "A media URL is too long.",
 media_must_use_https: "Media URLs must use HTTPS.",
 media_control_characters: "Media contains invalid control characters.",

 biography_too_long: "Your biography exceeds the maximum length.",

 post_already_blocked: "You already blocked this post.",
 user_already_blocked: "You already blocked this user.",
 topic_already_blocked: "You already blocked this topic.",
 user_already_followed: "You already follow this user.",
 topic_already_followed: "You already follow this topic.",

 invalid_agent_address: "Invalid agent address.",
 duplicate_agent: "Duplicate agent in the list.",
 agents_must_be_array: "Agents must be provided as a list.",
 agent_already_enabled: "This agent is already enabled.",
 cannot_enable_self_as_agent: "You cannot enable yourself as an agent.",
 cannot_set_self_as_agent: "You cannot set yourself as an agent.",
 too_many_agents: "You have too many agents enabled.",
 agent_tier_required: "Agent features require a higher subscription tier.",
 missing_tier_config: "Agent tier configuration is missing.",
 missing_profile_level: "Profile level is missing.",
 missing_max_agents: "Max enabled agents configuration is missing.",
 invalid_user_level: "Invalid user level.",

 not_subscriber: "This action requires an active subscription.",
 invalid_level: "Invalid subscription level.",
 insufficient_balance: "Insufficient balance to complete this transaction.",
 admin_insufficient_balance: "Your account balance is too low to cover the transaction fee.",
 insufficient_funds: "Node does not have enough gas for this transaction.",
 auto_renew_required: "Auto-renewal setting is required.",

 cannot_award_own_post: "You cannot award your own post.",
 already_awarded: "You already awarded this post.",
 award_eligibility_failed: "Unable to verify award eligibility.",
 unknown_award_type: "Unknown award type.",

 push_disabled: "Push notifications are not enabled on this node.",
 push_invalid_token: "Invalid push notification token format.",
 push_token_length: "Invalid push notification token length.",
 push_invalid_platform: "Push platform must be ios or android.",
 push_token_other_account: "This push token is registered to another account.",

 reason_too_long: "Report reason is too long (max 200 characters).",
 admin_required: "Admin address is required.",
 admin_and_target_required: "Admin and target are required.",
 admin_target_duration_reason_required: "Admin, target, duration, and reason are required.",
 suspended: "Your account is suspended.",

 query_required: "Search query is required.",
 count_must_be_non_negative: "Count must be non-negative.",
 invalid_amount: "Invalid amount.",
 amount_must_be_positive: "Amount must be positive.",
 invalid_duration_days: "Invalid duration.",
 invalid_month_format: "Invalid month format (use YYYY-MM).",
 invalid_max_depth: "Invalid max depth.",
 unsupported_sort_mode: "Unsupported sort mode.",

 quest_id_required: "Quest ID is required.",
 unknown_quest_id: "Unknown quest ID.",
 quest_not_assigned: "Quest is not assigned for today.",
 quest_already_completed: "Quest already completed.",
 no_rewards: "No rewards available.",
 pool_not_configured: "Reward pool is not configured.",
 payout_failed: "Payout failed. Please try again.",
 stats_event_disabled: "Stats events are disabled on this node.",
 retry: "Please retry the request.",
 not_configured: "Service is not configured.",

 destination_chain_required: "Destination chain is required.",
 destination_address_required: "Destination address is required.",
 destination_chain_not_enabled: "Destination chain is not enabled.",
 destination_chain_too_long: "Destination chain is too long.",
 destination_address_too_long: "Destination address is too long.",
 invalid_solana_address: "Invalid Solana address.",
 invalid_solana_address_length: "Invalid Solana address length.",
 burn_sequence_required: "Burn sequence is required.",
 burn_tx_hash_required: "Burn tx hash is required.",
 burn_sequence_not_allowed_outbound: "Burn sequence is not allowed for outbound queries.",
 burn_tx_hash_not_allowed_inbound: "Burn tx hash is not allowed for inbound queries.",
 invalid_burn_tx_hash: "Invalid burn tx hash.",

 upload_service_error: "Upload service encountered an error.",
 uploads_disabled: "Media uploads are currently disabled on this node.",
 cloudflare_not_configured: "Upload service is not configured.",
 cloudflare_stream_not_configured: "Stream upload service is not configured.",
 cloudflare_no_url: "Upload service did not return a URL.",
 cloudflare_stream_no_url: "Stream upload service did not return a URL.",
 image_type_only: "Only image uploads are supported.",
 invalid_media_type: "Unsupported media type.",
 file_required: "Choose a file to upload.",
 file_too_large: "This file is too large to upload.",
 image_too_large: "This image is too large to upload.",
 video_too_large: "This video is too large to upload. Please choose a shorter or lower-resolution video.",
 video_duration_too_long: "This video is too long to upload. Please choose a shorter video.",
 video_type_only: "Only video uploads are supported.",
 invalid_video_uid: "Invalid video UID.",

 transaction_rejected: "Transaction was rejected by the chain.",
 out_of_gas: "Transaction ran out of gas.",
 fee_payer_insufficient_funds: "Fee payer has insufficient funds.",
 empty_error_log: "Chain returned an empty error log.",
};

const RETRYABLE_CODES = new Set([
 "node_catching_up",
 "backend_not_initialized",
 "indexer_unavailable",
 "pool_not_configured",
 "payout_failed",
 "retry",
]);

const MAYBE_RETRYABLE_CODES = new Set(["internal_error"]);

const DEFAULT_MESSAGE = "Something went wrong.";

export function getErrorMessage(errorCode: string): string {
 return ERROR_MESSAGES[errorCode] ?? DEFAULT_MESSAGE;
}

export function isRetryable(errorCode: string): boolean {
 return RETRYABLE_CODES.has(errorCode);
}

export function isMaybeRetryable(errorCode: string): boolean {
 return MAYBE_RETRYABLE_CODES.has(errorCode);
}

export function isKnownErrorCode(errorCode: string): boolean {
 return errorCode in ERROR_MESSAGES;
}

export { ERROR_MESSAGES, RETRYABLE_CODES, DEFAULT_MESSAGE };
