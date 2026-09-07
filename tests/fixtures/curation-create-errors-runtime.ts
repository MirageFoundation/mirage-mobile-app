// @ts-nocheck -- Isolated Bun fixture; native APIs/signing are mocked, no network.
import { mock } from "bun:test";
import assert from "node:assert/strict";
import * as React from "react";
import { QueryClient, MutationObserver } from "@tanstack/react-query";

const breadcrumbs = [];
const exceptions = [];
const consoleErrors = [];
const toasts = [];
let successEffects = 0;
let reads = 0;
let posts = 0;
let status = 400;
let body = { error: "active subscription required", error_code: "not_subscriber", private_detail: "must-not-report" };
console.error = (...args) => consoleErrors.push(args);
mock.module("expo/fetch", () => ({ fetch: async () => {
  posts++;
  return new Response(JSON.stringify(body), { status });
} }));
mock.module("expo-network", () => ({ getNetworkStateAsync: async () => ({ isConnected: true }) }));
mock.module("@sentry/react-native", () => ({
  addBreadcrumb: value => breadcrumbs.push(value),
  captureException: (...args) => exceptions.push(args),
  captureMessage: (...args) => exceptions.push(args),
}));
mock.module("../../src/services/wallet-service", () => ({ walletService: { getWalletMetadata: () => null } }));
mock.module("../../src/stores/inbox-store", () => ({ useInboxStore: { getState: () => ({}) } }));
mock.module("../../src/stores/cloudflare-error-store", () => ({ useCloudflareErrorStore: { getState: () => ({ clearError() {}, setError() {} }) } }));
mock.module("../../src/stores/auth-store", () => ({ useAuthStore: { getState: () => ({ walletAddress: "fixture-wallet" }) } }));
mock.module("../../src/stores/preferences-store", () => ({
  getApiBaseUrl: server => `https://${server}`,
  usePreferencesStore: Object.assign(selector => selector({ apiServer: "a.example" }), { getState: () => ({ apiServer: "a.example" }) }),
}));
const { configureVisitorIdentityForTests } = await import("../../src/services/visitor-identity");
const { configureMiragePlatformForTests } = await import("../../src/api/mirage-request-headers");
configureVisitorIdentityForTests({ storage: { getString: () => "test-visitor-identity", set() {} } });
configureMiragePlatformForTests("ios");
const { apiClient } = await import("../../src/api/client");
const { parseApiError } = await import("../../src/utils/parse-api-error");

mock.module("../../src/api/write/signing", () => ({
  buildSignedEnvelope: async () => ({ signature: "fixture" }),
  ...Object.fromEntries([
    "AcceptCuratorInvite", "CreateCurationTeam", "DeclineCuratorInvite",
    "DeleteCurationTeam", "InviteCurator", "LeaveCurationTeam", "RemoveCurator",
    "RevokeCuratorInvite", "SetCurationPostHidden", "SetCurationPostTag",
    "SetCurationSubscriberOnly", "SetCurationTag", "SetCurationTeamProfile",
    "SetCurationThreadLocked", "SetCurationUserHidden", "TransferCurationTeam",
  ].map(name => [`canonBase${name}`, () => new Uint8Array()])),
}));
mock.module("../../src/api/read/endpoints/curation", () => Object.fromEntries([
  "getCommunityTeam", "getCommunityTeamHiddenPosts", "getCommunityTeamHiddenUsers",
  "getCommunityTeamInvitations", "getCommunityTeamModeration", "getCommunityTeams",
].map(name => [name, async () => { reads++; return { items: [] }; }])));
mock.module("../../src/api/write/utils/curation-settled-effects", () => ({
  applyCurationSettledEffects: () => { successEffects++; },
}));
mock.module("../../src/hooks/use-wallet", () => ({
  useWallet: () => ({ getWallet: async () => ({ address: "fixture-wallet" }), address: "fixture-wallet" }),
}));
const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
let pending;
let lastError;
mock.module("@tanstack/react-query", () => ({
  useQueryClient: () => queryClient,
  useMutation: options => {
    const observer = new MutationObserver(queryClient, options);
    observer.subscribe(() => {});
    return {
      isPending: false,
      mutate: (input, callbacks) => {
        pending = observer.mutate(input, callbacks).catch(error => { lastError = error; });
      },
    };
  },
}));
const { useCreateCurationTeam } = await import("../../src/api/write/hooks/use-curation");
mock.module("../../src/api/write", () => ({ useCreateCurationTeam }));
mock.module("react", () => ({
  ...React,
  useCallback: fn => fn,
  useMemo: fn => fn(),
  useRef: current => ({ current }),
  useState: initial => [initial, () => {}],
}));
mock.module("../../src/navigation/guarded-router", () => ({ useRouter: () => ({ push: () => { successEffects++; } }) }));
mock.module("../../src/stores", () => ({ useAuthStore: selector => selector({ walletAddress: "fixture-wallet" }) }));
mock.module("../../src/api/read", () => ({
  useCommunityTeams: () => ({ data: { items: [] }, refetch: () => { reads++; } }),
}));
mock.module("../../src/providers/toast-provider", () => ({
  useToast: () => ({
    error: (...args) => toasts.push(args),
    success: () => { successEffects++; },
  }),
}));
const { useCommunityTeamsController } = await import("../../src/pages/curation/use-community-teams-controller");
// eslint-disable-next-line react-hooks/rules-of-hooks -- Hook primitives are mocked for this isolated controller test.
const controller = useCommunityTeamsController("test");

for (const responseStatus of [400, 403]) {
  status = responseStatus;
  controller.creation.handleCreate({ name: "Test team", description: "Test" });
  await pending;
  assert.equal(lastError.isAxiosError, true);
  assert.equal(lastError.response.data.error_code, "not_subscriber");
  assert.equal(parseApiError(lastError).retryable, false);
  assert.deepEqual(toasts.at(-1), ["Active subscription required"]);
  assert.equal(toasts.at(-1)[0].split(" ").length, 3);
  assert.deepEqual(breadcrumbs.at(-1), {
    category: "api.eligibility",
    message: "Team creation requires an active subscription",
    level: "info",
    data: { method: "POST", path: "/core/create_curation_team", status, error_code: "not_subscriber" },
  });
}
assert.equal(posts, 2);
assert.equal(toasts.length, 2);
assert.equal(exceptions.length, 0);
assert.equal(consoleErrors.length, 0);
assert.equal(JSON.stringify(breadcrumbs).includes("must-not-report"), false);
assert.equal(successEffects, 0);
assert.equal(reads, 0);

status = 400;
body = { error_code: "unrecognized_failure", error: "Private internal failure details" };
controller.creation.handleCreate({ name: "Test team", description: "Test" });
await pending;
assert.deepEqual(toasts.at(-1), ["Team creation failed"]);
assert.equal(toasts.length, 3);
assert.equal(exceptions.length, 1);
assert.equal(consoleErrors.length, 1);
assert.equal(successEffects, 0);
assert.equal(reads, 0);

// A code alone must not silence unrelated endpoints or unexpected HTTP statuses.
body = { error_code: "not_subscriber", error: "active subscription required" };
for (const [path, responseStatus] of [
  ["/core/other", 400],
  ["/core/create_curation_team", 500],
  ["/core/create_curation_team", 401],
]) {
  status = responseStatus;
  const previousLogs = consoleErrors.length;
  const previousExceptions = exceptions.length;
  await assert.rejects(apiClient.post(path, { signature: "fixture" }));
  assert.equal(consoleErrors.length, previousLogs + 1);
  if (status === 400 || status >= 500) assert.equal(exceptions.length, previousExceptions + 1);
}
queryClient.clear();
