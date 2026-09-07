import {
  useDeferredCampaignStore,
  type DeferredCampaignSnapshot,
} from "@/src/stores/deferred-campaign-store";
import {
  getNetworkState,
  subscribeNetworkState,
} from "@/src/stores/network-state-store";

type AppStateStatus = "active" | "background" | "inactive" | "unknown" | "extension";
type AppStateLike = {
  currentState: AppStateStatus;
  addEventListener: (
    type: "change",
    listener: (state: AppStateStatus) => void,
  ) => { remove: () => void };
};

const MAX_ATTEMPTS_PER_CYCLE = 3;
const RETRY_DELAYS_MS = [2_000, 8_000] as const;
const COOLDOWN_MS = 60_000;

type AttributionClock = {
  now: () => number;
  setTimeout: (handler: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
};

type VisitorAttributionTestConfig = {
  post?: (snapshot: DeferredCampaignSnapshot) => Promise<unknown>;
  getGeneration?: () => number;
  isOnline?: () => boolean;
  isAppActive?: () => boolean;
  clock?: AttributionClock;
};

let testConfig: VisitorAttributionTestConfig | null = null;
let inFlight: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let attemptsThisCycle = 0;
let cooldownUntil = 0;
let appState: AppStateStatus = "active";
let lifecycleStarted = false;
const lifecycleStops: (() => void)[] = [];

function clock(): AttributionClock {
  return (
    testConfig?.clock ?? {
      now: Date.now,
      setTimeout,
      clearTimeout,
    }
  );
}

function isAppActive(): boolean {
  if (testConfig?.isAppActive) return testConfig.isAppActive();
  return appState === "active";
}

function isOnline(): boolean {
  if (testConfig?.isOnline) return testConfig.isOnline();
  return getNetworkState().isConnected;
}

function getAppStateModule(): AppStateLike {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppState } = require("react-native") as { AppState: AppStateLike };
  return AppState;
}

function getGeneration(): number {
  if (testConfig?.getGeneration) return testConfig.getGeneration();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { apiClient } = require("../api/client") as {
    apiClient: { getCurrentServerContext: () => { generation: number } };
  };
  return apiClient.getCurrentServerContext().generation;
}

function shouldDeliver(): boolean {
  const { pending, acknowledgedAt } = useDeferredCampaignStore.getState();
  return !!pending && acknowledgedAt == null;
}

function clearRetryTimer(): void {
  if (!retryTimer) return;
  clock().clearTimeout(retryTimer);
  retryTimer = null;
}

function enterCooldown(): void {
  clearRetryTimer();
  cooldownUntil = clock().now() + COOLDOWN_MS;
}

function isRetryableAttributionFailure(error: unknown): boolean {
  if (
    !!error &&
    typeof error === "object" &&
    (error as { name?: string }).name === "StaleServerResponseError"
  ) {
    return false;
  }
  const candidate = error as {
    code?: string;
    message?: string;
    status?: number;
    response?: { status?: number };
  } | null;
  const status = candidate?.status ?? candidate?.response?.status;
  if (status === 408 || status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;
  if (typeof status === "number") return false;
  return (
    candidate?.code === "ERR_NETWORK" ||
    candidate?.code === "ECONNABORTED" ||
    candidate?.message === "Network Error" ||
    true
  );
}

async function sendSnapshot(snapshot: DeferredCampaignSnapshot): Promise<unknown> {
  if (testConfig?.post) return testConfig.post(snapshot);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { postVisitorAttribution } = require("../api/write/endpoints/visitor-attribution") as {
    postVisitorAttribution: (
      snapshot: DeferredCampaignSnapshot,
    ) => Promise<unknown>;
  };
  return postVisitorAttribution(snapshot);
}

async function runAttempt(): Promise<void> {
  if (!shouldDeliver() || !isAppActive() || !isOnline()) return;

  const pending = useDeferredCampaignStore.getState().pending;
  if (!pending) return;
  const snapshot: DeferredCampaignSnapshot = { ...pending };
  const generation = getGeneration();
  attemptsThisCycle += 1;

  try {
    const data = await sendSnapshot(snapshot);
    const accepted =
      !!data &&
      typeof data === "object" &&
      (data as { ok?: unknown }).ok === true;
    if (!accepted) {
      enterCooldown();
      return;
    }
    if (getGeneration() !== generation) return;
    useDeferredCampaignStore.getState().acknowledgeAttributionSuccess(snapshot);
    attemptsThisCycle = 0;
    cooldownUntil = 0;
  } catch (error) {
    if (
      isRetryableAttributionFailure(error) &&
      attemptsThisCycle < MAX_ATTEMPTS_PER_CYCLE
    ) {
      scheduleRetry(RETRY_DELAYS_MS[attemptsThisCycle - 1] ?? RETRY_DELAYS_MS[1]);
      return;
    }
    enterCooldown();
  }
}

function scheduleRetry(delayMs: number): void {
  clearRetryTimer();
  if (!isAppActive() || !isOnline()) return;
  retryTimer = clock().setTimeout(() => {
    retryTimer = null;
    void deliver();
  }, delayMs);
}

async function deliver(): Promise<void> {
  if (inFlight) return;
  inFlight = runAttempt().finally(() => {
    inFlight = null;
  });
  await inFlight;
}

export function requestVisitorAttributionDelivery(): void {
  if (!shouldDeliver()) return;
  if (inFlight) return;
  if (retryTimer) return;
  if (!isAppActive() || !isOnline()) {
    clearRetryTimer();
    return;
  }
  const now = clock().now();
  if (now < cooldownUntil) return;
  if (attemptsThisCycle >= MAX_ATTEMPTS_PER_CYCLE) {
    attemptsThisCycle = 0;
  }
  void deliver();
}

export function startVisitorAttributionLifecycle(): () => void {
  if (lifecycleStarted) {
    return stopVisitorAttributionLifecycle;
  }
  lifecycleStarted = true;
  const AppState = getAppStateModule();
  appState = AppState.currentState;

  const appSub = AppState.addEventListener("change", (nextState) => {
    appState = nextState;
    if (nextState === "active") {
      requestVisitorAttributionDelivery();
      return;
    }
    clearRetryTimer();
  });
  lifecycleStops.push(() => appSub.remove());

  const stopNetwork = subscribeNetworkState((state) => {
    if (state.isConnected) {
      requestVisitorAttributionDelivery();
      return;
    }
    clearRetryTimer();
  });
  lifecycleStops.push(stopNetwork);

  const stopPending = useDeferredCampaignStore.subscribe((state) => {
    if (state.pending && state.acknowledgedAt == null) {
      requestVisitorAttributionDelivery();
    }
  });
  lifecycleStops.push(stopPending);

  requestVisitorAttributionDelivery();
  return stopVisitorAttributionLifecycle;
}

export function stopVisitorAttributionLifecycle(): void {
  clearRetryTimer();
  while (lifecycleStops.length > 0) lifecycleStops.pop()?.();
  lifecycleStarted = false;
}

export function configureVisitorAttributionForTests(
  config: VisitorAttributionTestConfig | null,
): void {
  stopVisitorAttributionLifecycle();
  inFlight = null;
  attemptsThisCycle = 0;
  cooldownUntil = 0;
  testConfig = config;
}

export function getVisitorAttributionCycleStateForTests() {
  return {
    attemptsThisCycle,
    cooldownUntil,
    hasRetryTimer: retryTimer != null,
    inFlight: inFlight != null,
  };
}

export function flushVisitorAttributionForTests(): Promise<void> {
  return inFlight ?? Promise.resolve();
}
