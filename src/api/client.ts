import axios, { type AxiosError, type AxiosInstance } from "axios";
import { useInboxStore } from "@/src/stores/inbox-store";

const DEFAULT_NODES = [
  "https://mirage.vote",
  "https://mirage.vote", // fallback
];

class ApiClient {
  private client: AxiosInstance;
  private nodeList: string[];
  private currentNodeIndex: number;

  constructor() {
    this.nodeList = DEFAULT_NODES;
    this.currentNodeIndex = 0;

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
        if (data && typeof data === "object" && "new_inbox_items" in data) {
          useInboxStore.getState().setUnreadCount((data as any).new_inbox_items);
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

  /**
   * GET request
   */
  async get<T, P = unknown>(path: string, params?: P): Promise<T> {
    console.log(
      `[ApiClient] GET ${path}`,
      params ? `with params: ${JSON.stringify(params)}` : "no params"
    );
    try {
      const response = await this.client.get<T>(`/api${path}`, { params });
      console.log(`[ApiClient] GET ${path} success`);
      return response.data;
    } catch (error: any) {
      const errorData = error?.response?.data;
      const errorMessage = error?.message;
      const status = error?.response?.status;
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
