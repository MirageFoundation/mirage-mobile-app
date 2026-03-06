import axios, { type AxiosError, type AxiosInstance } from "axios";
import * as Sentry from "@sentry/react-native";
import { walletService } from "@/src/services/wallet-service";
import { useInboxStore } from "@/src/stores/inbox-store";

const DEFAULT_NODES = [
  "https://mirage.talk",
  "https://mirage.talk", // fallback
];

const MAX_CONCURRENT_REQUESTS = 6;
const RATE_LIMIT_RETRY_DELAY = 1000;
const MAX_RATE_LIMIT_RETRIES = 3;

class ApiClient {
  private client: AxiosInstance;
  private nodeList: string[];
  private currentNodeIndex: number;
  private activeRequests: number;
  private requestQueue: Array<() => void>;

  constructor() {
    this.nodeList = DEFAULT_NODES;
    this.currentNodeIndex = 0;
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
        // On network error, try failover to next node
        if (
          error.code === "ECONNABORTED" ||
          error.code === "ERR_NETWORK" ||
          !error.response
        ) {
          const originalRequest = error.config;
          if (originalRequest && !originalRequest.headers["X-Retry"]) {
            await this.failover();
            originalRequest.baseURL = this.getBaseUrl();
            originalRequest.headers["X-Retry"] = "true";
            return this.client(originalRequest);
          }
        }
        return Promise.reject(error);
      }
    );
  }

  private getBaseUrl(): string {
    return this.nodeList[this.currentNodeIndex];
  }

  /**
   * Switch to next node on failure
   */
  async failover(): Promise<void> {
    this.currentNodeIndex = (this.currentNodeIndex + 1) % this.nodeList.length;
    this.client.defaults.baseURL = this.getBaseUrl();
    Sentry.addBreadcrumb({
      category: "api",
      message: `Failover to node: ${this.getBaseUrl()}`,
      level: "warning",
    });
    console.log(`[ApiClient] Failover to: ${this.getBaseUrl()}`);
  }

  /**
   * Allow runtime URL change
   */
  setBaseUrl(url: string): void {
    this.nodeList = [url, ...DEFAULT_NODES.filter((n) => n !== url)];
    this.currentNodeIndex = 0;
    this.client.defaults.baseURL = url;
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
  async get<T, P = unknown>(path: string, params?: P): Promise<T> {
    return this.withConcurrencyLimit(() => this.executeGet<T, P>(path, params));
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
    params?: P,
    retryCount = 0,
  ): Promise<T> {
    console.log(
      `[ApiClient] GET ${path}`,
      params ? `with params: ${JSON.stringify(params)}` : "no params"
    );
    try {
      const response = await this.client.get<T>(`/api${path}`, {
        params: this.withInboxLastViewed(
          params as Record<string, unknown> | undefined
        ),
      });
      console.log(`[ApiClient] GET ${path} success`);
      return response.data;
    } catch (error: any) {
      const errorData = error?.response?.data;
      const errorMessage = error?.message;
      const status = error?.response?.status;

      if (status === 429 && retryCount < MAX_RATE_LIMIT_RETRIES) {
        const delay = RATE_LIMIT_RETRY_DELAY * Math.pow(2, retryCount);
        console.log(
          `[ApiClient] Rate limited on ${path}, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RATE_LIMIT_RETRIES})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.executeGet<T, P>(path, params, retryCount + 1);
      }

      Sentry.addBreadcrumb({
        category: "api",
        message: `GET ${path} failed`,
        level: "error",
        data: { status, errorMessage, errorData },
      });
      if (status && status >= 500) {
        Sentry.captureException(error, {
          tags: { api_method: "GET", api_path: path },
          extra: { status, errorData },
        });
      }
      console.error(`[ApiClient] GET ${path} failed`);
      console.error(`[ApiClient] Status:`, status);
      console.error(`[ApiClient] Error data:`, errorData);
      console.error(`[ApiClient] Error message:`, errorMessage);
      console.error(
        `[ApiClient] Params sent:`,
        JSON.stringify(params, null, 2)
      );
      throw error;
    }
  }

  /**
   * POST request
   */
  async post<T, D = unknown>(path: string, data?: D): Promise<T> {
    console.log(`[ApiClient] POST ${path}`, data ? "with data" : "no data");
    try {
      const response = await this.client.post<T>(`/api${path}`, data);
      console.log(`[ApiClient] POST ${path} success:`, response.data);
      return response.data;
    } catch (error: any) {
      const status = error?.response?.status;
      const errorData = error?.response?.data;
      Sentry.addBreadcrumb({
        category: "api",
        message: `POST ${path} failed`,
        level: "error",
        data: { status, errorData: errorData || error?.message },
      });
      if (status && status >= 500) {
        Sentry.captureException(error, {
          tags: { api_method: "POST", api_path: path },
          extra: { status, errorData },
        });
      }
      console.error(
        `[ApiClient] POST ${path} failed:`,
        error?.response?.data || error?.message || error
      );
      throw error;
    }
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
  get: <T, P = unknown>(path: string, params?: P) =>
    apiClient.get<T, P>(path, params),
  post: <T, D = unknown>(path: string, data?: D) =>
    apiClient.post<T, D>(path, data),
};
