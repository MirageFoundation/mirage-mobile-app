import axios, { AxiosError, type AxiosInstance } from "axios";
import * as Sentry from "@sentry/react-native";
import * as Network from "expo-network";
import { walletService } from "@/src/services/wallet-service";
import { useInboxStore } from "@/src/stores/inbox-store";
import { useCloudflareErrorStore } from "@/src/stores/cloudflare-error-store";
import { isKnownErrorCode, isRetryable } from "@/src/utils/error-messages";
import { assertReadActive, awaitReadTask, isRetryableReadError, markCompletedApiRead, readRetryDelay, waitForReadRetry } from "./read-retry-policy";
import {
  applyMirageIdentityToAxiosRequest,
  isTrustedMirageApiDestination,
} from "@/src/api/mirage-request-headers";
import {
  ServerRequestCoordinator,
  StaleServerResponseError,
  normalizeServerBaseUrl,
  type ServerRequestContext,
  type ServerSwitchHooks,
} from "@/src/api/server-runtime";
import { getApiBaseUrl, usePreferencesStore } from "@/src/stores/preferences-store";
import { isRedirectError, jsonTransport } from "@/src/api/json-transport";
import { writeFailureDiagnostics } from "@/src/api/write-failure-diagnostics";

const DEFAULT_NODE = "https://mirage.talk";

/**
 * Resolve the user's selected node at construction time. Preferences hydrate
 * synchronously from MMKV, so this is safe at module eval. Without this,
 * headless launches (background inbox fetch, boot-time task start) — where
 * ApiServerProvider never mounts and therefore never calls setBaseUrl() —
 * would silently talk to the default node instead of the selected one.
 */
function getInitialNode(): string {
  try {
    const server = usePreferencesStore.getState().apiServer;
    return server ? getApiBaseUrl(server) : DEFAULT_NODE;
  } catch {
    return DEFAULT_NODE;
  }
}

const MAX_CONCURRENT_REQUESTS = 6;

function getNetworkDiagnostics(networkState: Network.NetworkState) {
  return {
    type: networkState.type,
    isConnected: networkState.isConnected,
    isInternetReachable: networkState.isInternetReachable,
  };
}

class ApiClient {
  private client: AxiosInstance;
  private coordinator: ServerRequestCoordinator;
  private activeRequests: number;
  private requestQueue: (() => void)[];

  constructor() {
    this.coordinator = new ServerRequestCoordinator(getInitialNode());
    this.activeRequests = 0;
    this.requestQueue = [];

    this.client = axios.create({
      baseURL: this.getBaseUrl(),
      timeout: 30000,
      adapter: jsonTransport,
      maxRedirects: 0,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.client.interceptors.request.use((config) => {
      applyMirageIdentityToAxiosRequest(config as any, [this.getBaseUrl()]);
      return config;
    });

    // Response interceptor for error handling and failover
    this.client.interceptors.response.use(
      (response) => {
        const serverContext = (response.config as typeof response.config & {
          serverContext?: ServerRequestContext;
        }).serverContext;
        if (serverContext) {
          this.coordinator.assertCurrent(serverContext);
        }
        const data = response.data;
        if (data && typeof data === "object") {
          const currentAddress = this.getCurrentAddress();
          const requestAddress = this.getRequestAddress(
            response.config?.params,
            response.config?.data,
          );
          const shouldSyncInbox =
            !!currentAddress &&
            !!requestAddress &&
            currentAddress.toLowerCase() === requestAddress.toLowerCase();

          if (shouldSyncInbox && "new_inbox_items" in data) {
            const unreadCount = Number((data as any).new_inbox_items);
            if (Number.isFinite(unreadCount)) {
              useInboxStore.getState().setUnreadCount(unreadCount);
            }
          }

          if (shouldSyncInbox && "latest_inbox_timestamp" in data) {
            const latestTimestamp = Number(
              (data as any).latest_inbox_timestamp
            );
            if (Number.isFinite(latestTimestamp)) {
              useInboxStore
                .getState()
                .setLatestInboxTimestamp(latestTimestamp);
            }
          }
        }
        return response;
      },
      async (error: AxiosError) => {
        if (isRedirectError(error)) return Promise.reject(error);
        const serverContext = (error.config as (typeof error.config & {
          serverContext?: ServerRequestContext;
        }) | undefined)?.serverContext;
        if (serverContext) {
          try {
            this.coordinator.assertCurrent(serverContext);
          } catch (staleError) {
            return Promise.reject(staleError);
          }
        }
        if (isRedirectError(error)) return Promise.reject(error);
        // On network error, retry only against the currently selected node.
        // Do not silently fail over to another Mirage node; the selected API
        // server is user-visible state and must stay authoritative.
        if (
          error.config?.method?.toLowerCase() !== "get" &&
          error.code !== "ERR_CANCELED" &&
          (error.code === "ECONNABORTED" ||
            error.code === "ERR_NETWORK" ||
            !error.response)
        ) {
          const originalRequest = error.config;
          if (originalRequest && !originalRequest.headers["X-Retry"]) {
            Sentry.addBreadcrumb({
              category: "api",
              message: "API request failed; retrying selected node",
              data: {
                code: error.code,
                method: originalRequest.method,
                url: originalRequest.url,
                baseURL: originalRequest.baseURL,
              },
              level: "warning",
            });
            originalRequest.headers["X-Retry"] = "true";
            return this.client(originalRequest);
          }
        }
        return Promise.reject(error);
      }
    );
  }

  private getBaseUrl(): string {
    return this.coordinator.getContext().baseUrl;
  }

  getCurrentServerContext(): ServerRequestContext {
    return this.coordinator.getContext();
  }

  /**
   * Switch to next configured node on failure.
   * Currently this is intentionally a no-op unless multiple nodes are
   * explicitly configured. Runtime server selection should never drift from
   * the user's selected API server.
   */
  async failover(): Promise<void> {
    Sentry.addBreadcrumb({
      category: "api",
      message: "Skipped node failover; only selected node is configured",
      level: "warning",
    });
  }

  /**
   * Allow runtime URL change
   */
  setBaseUrl(url: string): void {
    const context = this.coordinator.replaceImmediately(url);
    this.client.defaults.baseURL = context.baseUrl;
  }

  async switchBaseUrl(url: string, hooks: ServerSwitchHooks): Promise<void> {
    try {
      await this.coordinator.switchServer(url, hooks);
    } finally {
      this.client.defaults.baseURL = this.getBaseUrl();
    }
  }

  getCurrentBaseUrl(): string {
    return this.getBaseUrl();
  }

  runExternalWrite<T>(
    operation: (context: ServerRequestContext) => Promise<T>,
  ): Promise<T> {
    return this.coordinator.runWrite(operation);
  }

  assertCurrentServerContext(context: ServerRequestContext): void {
    this.coordinator.assertCurrent(context);
  }

  async postTrustedAbsolute<T, D = unknown>(
    absoluteUrl: string,
    data?: D,
  ): Promise<T> {
    let origin: string;
    try {
      origin = normalizeServerBaseUrl(new URL(absoluteUrl).origin);
    } catch {
      throw new Error("Invalid trusted Mirage destination");
    }
    if (!isTrustedMirageApiDestination(absoluteUrl, [origin])) {
      throw new Error("Refusing untrusted Mirage API destination");
    }
    const response = await this.client.post<T>(absoluteUrl, data, {
      mirageTrustedOrigins: [origin],
    } as any);
    return response.data;
  }

  /**
   * Get full API URL for a path
   */
  getApiUrl(path: string): string {
    return `${this.getBaseUrl()}/api${path}`;
  }

  private getCurrentAddress(): string | null {
    return walletService.getWalletMetadata()?.address ?? null;
  }

  private getRequestAddress(
    params?: Record<string, unknown>,
    rawBody?: unknown,
  ): string | null {
    let body = rawBody;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = undefined;
      }
    }
    const bodyRecord =
      body && typeof body === "object"
        ? (body as Record<string, unknown>)
        : undefined;
    const address =
      params?.address ??
      params?.owner ??
      bodyRecord?.address ??
      bodyRecord?.owner;
    if (!address) return null;
    return String(address).trim();
  }

  private withInboxLastViewed(
    params?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (!params || typeof params !== "object") return params;

    const currentAddress = this.getCurrentAddress();
    if (!currentAddress) return params;

    const requestAddress = this.getRequestAddress(params);
    if (
      requestAddress &&
      currentAddress.toLowerCase() !== requestAddress.toLowerCase()
    ) {
      return params;
    }

    if (
      params.inbox_last_viewed_at !== undefined &&
      params.inbox_last_viewed_at !== null
    ) {
      return params;
    }

    const lastViewedAt = useInboxStore.getState().lastViewedAt;
    if (!lastViewedAt) return params;

    return { ...params, inbox_last_viewed_at: lastViewedAt };
  }

  /**
   * GET request
   */
  get<T, P = unknown>(
    path: string,
    params?: P,
    options?: { signal?: AbortSignal; paramsFactory?: () => Promise<P> },
  ): Promise<T> {
    const viewer = this.getCurrentAddress();
    return this.coordinator.runRead(
      (serverContext, signal) =>
        this.withConcurrencyLimit(() =>
          this.executeGet<T, P>(path, params, serverContext, signal, viewer, options?.paramsFactory),
          signal,
        ),
      options?.signal,
    );
  }

  private async withConcurrencyLimit<T>(fn: () => Promise<T>, signal: AbortSignal): Promise<T> {
    assertReadActive(signal);
    if (this.activeRequests >= MAX_CONCURRENT_REQUESTS) {
      await new Promise<void>((resolve, reject) => {
        const resume = () => {
          signal.removeEventListener("abort", abort);
          resolve();
        };
        const abort = () => {
          this.requestQueue = this.requestQueue.filter((task) => task !== resume);
          signal.removeEventListener("abort", abort);
          reject(new AxiosError("Read canceled", "ERR_CANCELED"));
        };
        this.requestQueue.push(resume);
        signal.addEventListener("abort", abort, { once: true });
      });
    } else {
      this.activeRequests++;
    }
    try {
      assertReadActive(signal);
      return await fn();
    } finally {
      if (this.requestQueue.length > 0) {
        const next = this.requestQueue.shift();
        next?.();
      } else {
        this.activeRequests--;
      }
    }
  }

  private async executeGet<T, P>(
    path: string,
    params: P | undefined,
    serverContext: ServerRequestContext,
    signal: AbortSignal,
    viewer: string | null,
    paramsFactory?: () => Promise<P>,
  ): Promise<T> {
    const assertActive = () => {
      this.coordinator.assertCurrent(serverContext);
      assertReadActive(signal);
      if (viewer !== this.getCurrentAddress()) throw new AxiosError("Inactive viewer", "ERR_CANCELED");
    };
    const prebuiltProof = !paramsFactory && params && typeof params === "object" &&
      ["signature", "pubkey", "envelope_nonce", "timestamp"].some((key) => key in params);
    for (let attempt = 1; ; attempt++) {
      assertActive();
      // Signing is outside the transport retry/report boundary.
      const requestParams = paramsFactory ? await awaitReadTask(paramsFactory(), signal) : params;
      assertActive();
      try {
        const response = await this.client.get<T>(`/api${path}`, {
          baseURL: serverContext.baseUrl,
          signal,
          params: this.withInboxLastViewed(requestParams as Record<string, unknown> | undefined),
          serverContext,
        } as any);
        assertActive();
        useCloudflareErrorStore.getState().clearError();
        return response.data;
      } catch (error: any) {
        assertActive();
        if (isRedirectError(error) || error instanceof StaleServerResponseError || error?.code === "ERR_CANCELED") throw error;
        if (!prebuiltProof && attempt < 3 && isRetryableReadError(error)) {
          await waitForReadRetry(readRetryDelay(error, attempt), signal);
          continue;
        }
        markCompletedApiRead(error);
        const status = error?.response?.status;
        const rawCode = error?.response?.data?.error_code ?? error?.code;
        const code = typeof rawCode === "string" && (isKnownErrorCode(rawCode) ||
          ["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT", "ERR_BAD_RESPONSE", "ERR_BAD_REQUEST"].includes(rawCode)) ? rawCode : "unknown";
        const safePath = path.split(/[?#]/)[0]
          .replace(/(\/curators\/)[^/]+/, "$1:viewer")
          .replace(/(\/communities\/)[^/]+/, "$1:community")
          .replace(/(\/teams\/)[^/]+/, "$1:team");
        const metadata = { method: "GET", path: safePath, status, code, attempts: attempt };
        Sentry.addBreadcrumb({ category: "api", message: "API read failed", level: "warning", data: metadata });
        if (status === 521) useCloudflareErrorStore.getState().setError(status);
        if (code !== "node_catching_up" && (!status || status >= 500)) {
          Sentry.captureException(new Error("API read failed"), {
            tags: { api_method: "GET", api_path: safePath, error_code: code },
            extra: metadata,
          });
        }
        throw error;
      }
    }
  }

  post<T, D = unknown>(path: string, data?: D): Promise<T> {
    return this.coordinator.runWrite(async (serverContext) => {
    const networkState = await Network.getNetworkStateAsync();
    if (!networkState.isConnected) {
      throw new AxiosError("Network Error", "ERR_NETWORK");
    }
    console.log(`[ApiClient] POST ${path}`, data ? "with data" : "no data");
    try {
      const response = await this.client.post<T>(`/api${path}`, data, {
        baseURL: serverContext.baseUrl,
        serverContext,
      } as any);
      console.log(`[ApiClient] POST ${path} success:`, response.data);
      useCloudflareErrorStore.getState().clearError();
      return response.data;
    } catch (error: any) {
      const status = error?.response?.status;
      const errorData = error?.response?.data;
      if (
        error?.code === "ERR_NETWORK" ||
        error?.code === "ECONNABORTED" ||
        error?.message === "Network Error"
      ) {
        console.log(`[ApiClient] POST ${path} failed: ${error?.message}`);
        Sentry.addBreadcrumb({
          category: "api",
          message: `POST ${path} transport failure`,
          data: {
            code: error?.code,
            errorMessage: error?.message,
            baseUrl: serverContext.baseUrl,
            network: getNetworkDiagnostics(networkState),
          },
          level: "warning",
        });
        Sentry.captureMessage("API POST transport failure", {
          level: "warning",
          tags: {
            feature: "api",
            api_method: "POST",
            api_path: path,
            error_code: error?.code ?? "unknown",
          },
          extra: {
            path,
            baseUrl: serverContext.baseUrl,
            network: getNetworkDiagnostics(networkState),
          },
        });
        throw error;
      }

      if (status === 429) {
        console.log(`[ApiClient] POST ${path} rate limited, skipping`);
        throw error;
      }

      const errorCode = errorData?.error_code;
      if (
        path === "/core/create_curation_team" &&
        (status === 400 || status === 403) &&
        errorCode === "not_subscriber"
      ) {
        Sentry.addBreadcrumb({
          category: "api.eligibility",
          message: "Team creation requires an active subscription",
          level: "info",
          data: { method: "POST", path, status, error_code: errorCode },
        });
        throw error;
      }
      if (errorCode && isRetryable(errorCode)) {
        console.log(
          `[ApiClient] Retryable error_code "${errorCode}" on POST ${path}`,
        );
      }

      if (path.startsWith("/core/")) {
        const diagnostics = writeFailureDiagnostics(path, error);
        Sentry.addBreadcrumb({
          category: "api.write",
          message: "Signed write failed",
          level: "error",
          data: diagnostics,
        });
        if (status === 521) useCloudflareErrorStore.getState().setError(status);
        Sentry.captureException(new Error("Signed write failed"), {
          tags: { api_method: "POST", api_path: diagnostics.path },
          extra: diagnostics,
        });
        console.error("[ApiClient] Signed write failed:", diagnostics);
        throw error;
      }

      Sentry.addBreadcrumb({
        category: "api",
        message: `POST ${path} failed`,
        level: "error",
        data: { status, errorData: errorData || error?.message },
      });
      if (status === 400) {
        Sentry.addBreadcrumb({
          category: "api.validation",
          message: `POST ${path} 400: ${JSON.stringify(errorData)}`,
          level: "error",
        });
        Sentry.captureException(error, {
          tags: { api_method: "POST", api_path: path, status_code: "400" },
          extra: { status, errorData, requestPath: path },
        });
      }
      if (status && status >= 500) {
        if (status === 521) {
          useCloudflareErrorStore.getState().setError(status);
        }
        Sentry.captureException(error, {
          tags: { api_method: "POST", api_path: path },
          extra: {
            status,
            errorData,
            baseUrl: serverContext.baseUrl,
            network: getNetworkDiagnostics(networkState),
          },
        });
      }
      console.error(
        `[ApiClient] POST ${path} failed:`,
        error?.response?.data || error?.message || error
      );
      throw error;
    }
    });
  }

  /**
   * Get the underlying axios instance for advanced use cases
   */
  getInstance(): AxiosInstance {
    return this.client;
  }
}

// Singleton instance
export const apiClient = new ApiClient();

// Direct access functions for simpler usage
export const api = {
  get: <T, P = unknown>(
    path: string,
    params?: P,
    options?: { signal?: AbortSignal; paramsFactory?: () => Promise<P> },
  ) => apiClient.get<T, P>(path, params, options),
  post: <T, D = unknown>(path: string, data?: D) =>
    apiClient.post<T, D>(path, data),
};
