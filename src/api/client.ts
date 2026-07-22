import axios, { AxiosError, type AxiosInstance } from "axios";
import * as Sentry from "@sentry/react-native";
import * as Network from "expo-network";
import { walletService } from "@/src/services/wallet-service";
import { useInboxStore } from "@/src/stores/inbox-store";
import { useCloudflareErrorStore } from "@/src/stores/cloudflare-error-store";
import { isRetryable, isMaybeRetryable } from "@/src/utils/error-messages";
import {
  ServerRequestCoordinator,
  StaleServerResponseError,
  type ServerRequestContext,
  type ServerSwitchHooks,
} from "@/src/api/server-runtime";

const DEFAULT_NODE = "https://mirage.talk";

const MAX_CONCURRENT_REQUESTS = 6;
const RATE_LIMIT_RETRY_DELAY = 1000;
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_RETRYABLE_ERROR_RETRIES = 3;
const RETRYABLE_ERROR_BASE_DELAY = 2000;
const MAX_SERVER_ERROR_RETRIES = 2;
const SERVER_ERROR_BASE_DELAY = 1500;

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
    this.coordinator = new ServerRequestCoordinator(DEFAULT_NODE);
    this.activeRequests = 0;
    this.requestQueue = [];

    this.client = axios.create({
      baseURL: this.getBaseUrl(),
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
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
          const requestAddress = this.getRequestAddress(response.config?.params);
          const shouldSyncInbox =
            !!currentAddress &&
            (!requestAddress ||
              currentAddress.toLowerCase() === requestAddress.toLowerCase());

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
        // On network error, retry only against the currently selected node.
        // Do not silently fail over to another Mirage node; the selected API
        // server is user-visible state and must stay authoritative.
        if (
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

  /**
   * Get full API URL for a path
   */
  getApiUrl(path: string): string {
    return `${this.getBaseUrl()}/api${path}`;
  }

  private getCurrentAddress(): string | null {
    return walletService.getWalletMetadata()?.address ?? null;
  }

  private getRequestAddress(params?: Record<string, unknown>): string | null {
    if (!params) return null;
    const address = params.address;
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
    options?: { signal?: AbortSignal },
  ): Promise<T> {
    return this.coordinator.runRead(
      (serverContext, signal) =>
        this.withConcurrencyLimit(() =>
          this.executeGet<T, P>(path, params, serverContext, signal),
        ),
      options?.signal,
    );
  }

  private async withConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeRequests >= MAX_CONCURRENT_REQUESTS) {
      await new Promise<void>((resolve) => {
        this.requestQueue.push(resolve);
      });
    }
    this.activeRequests++;
    try {
      return await fn();
    } finally {
      this.activeRequests--;
      if (this.requestQueue.length > 0) {
        const next = this.requestQueue.shift();
        next?.();
      }
    }
  }

  private async executeGet<T, P = unknown>(
    path: string,
    params: P | undefined,
    serverContext: ServerRequestContext,
    signal: AbortSignal,
    retryCount = 0,
  ): Promise<T> {
    const networkState = await Network.getNetworkStateAsync();
    if (!networkState.isConnected) {
      throw new AxiosError("Network Error", "ERR_NETWORK");
    }
    console.log(`[ApiClient] GET ${path}`, params ? "with params" : "no params");
    try {
      const response = await this.client.get<T>(`/api${path}`, {
        baseURL: serverContext.baseUrl,
        signal,
        params: this.withInboxLastViewed(
          params as Record<string, unknown> | undefined
        ),
        serverContext,
      } as any);
      console.log(`[ApiClient] GET ${path} success`);
      useCloudflareErrorStore.getState().clearError();
      return response.data;
    } catch (error: any) {
      if (
        error instanceof StaleServerResponseError ||
        error?.code === "ERR_CANCELED"
      ) {
        throw error;
      }
      const errorData = error?.response?.data;
      const errorMessage = error?.message;
      const status = error?.response?.status;

      if (
        error?.code === "ERR_NETWORK" ||
        error?.code === "ECONNABORTED" ||
        errorMessage === "Network Error"
      ) {
        console.log(`[ApiClient] GET ${path} failed: ${errorMessage}`);
        Sentry.addBreadcrumb({
          category: "api",
          message: `GET ${path} transport failure`,
          data: {
            code: error?.code,
            errorMessage,
            retryCount,
            baseUrl: serverContext.baseUrl,
            network: getNetworkDiagnostics(networkState),
          },
          level: "warning",
        });
        Sentry.captureMessage("API GET transport failure", {
          level: "warning",
          tags: {
            feature: "api",
            api_method: "GET",
            api_path: path,
            error_code: error?.code ?? "unknown",
          },
          extra: {
            path,
            retryCount,
            baseUrl: serverContext.baseUrl,
            network: getNetworkDiagnostics(networkState),
          },
        });
        throw error;
      }

      if (status === 429 && retryCount < MAX_RATE_LIMIT_RETRIES) {
        const delay = RATE_LIMIT_RETRY_DELAY * Math.pow(2, retryCount);
        console.log(
          `[ApiClient] Rate limited on ${path}, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RATE_LIMIT_RETRIES})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.executeGet<T, P>(
          path,
          params,
          serverContext,
          signal,
          retryCount + 1,
        );
      }

      const errorCode = errorData?.error_code;
      if (errorCode && isRetryable(errorCode) && retryCount < MAX_RETRYABLE_ERROR_RETRIES) {
        const delay = RETRYABLE_ERROR_BASE_DELAY * Math.pow(2, retryCount);
        console.log(
          `[ApiClient] Retryable error_code "${errorCode}" on GET ${path}, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRYABLE_ERROR_RETRIES})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.executeGet<T, P>(
          path,
          params,
          serverContext,
          signal,
          retryCount + 1,
        );
      }

      if (errorCode && isMaybeRetryable(errorCode) && retryCount < MAX_SERVER_ERROR_RETRIES) {
        const delay = SERVER_ERROR_BASE_DELAY * Math.pow(2, retryCount);
        console.log(
          `[ApiClient] Server error "${errorCode}" on GET ${path}, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_SERVER_ERROR_RETRIES})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.executeGet<T, P>(
          path,
          params,
          serverContext,
          signal,
          retryCount + 1,
        );
      }

      Sentry.addBreadcrumb({
        category: "api",
        message: `GET ${path} failed`,
        level: "error",
        data: { status, errorMessage, errorData },
      });
      if (status && status >= 500) {
        if (status === 521) {
          useCloudflareErrorStore.getState().setError(status);
        }
        Sentry.captureException(error, {
          tags: { api_method: "GET", api_path: path },
          extra: {
            status,
            errorData,
            retryCount,
            baseUrl: serverContext.baseUrl,
            network: getNetworkDiagnostics(networkState),
          },
        });
      }
      if (status && status >= 400 && status < 500) {
        console.warn(`[ApiClient] GET ${path} → ${status} ${errorData?.error_code ?? errorMessage}`);
      } else {
        console.error(`[ApiClient] GET ${path} failed`);
        console.error(`[ApiClient] Status:`, status);
        console.error(`[ApiClient] Error data:`, errorData);
        console.error(`[ApiClient] Error message:`, errorMessage);
        console.error(
          `[ApiClient] Params sent:`,
          JSON.stringify(params, null, 2)
        );
      }
      throw error;
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
      if (errorCode && isRetryable(errorCode)) {
        console.log(
          `[ApiClient] Retryable error_code "${errorCode}" on POST ${path}`,
        );
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
    options?: { signal?: AbortSignal },
  ) => apiClient.get<T, P>(path, params, options),
  post: <T, D = unknown>(path: string, data?: D) =>
    apiClient.post<T, D>(path, data),
};
