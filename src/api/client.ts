import axios, { type AxiosInstance, type AxiosError } from "axios";

const DEFAULT_NODES = [
  "https://mirage.talk",
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
      (response) => response,
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
    this.currentNodeIndex =
      (this.currentNodeIndex + 1) % this.nodeList.length;
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
    const response = await this.client.get<T>(`/api${path}`, { params });
    return response.data;
  }

  /**
   * POST request
   */
  async post<T, D = unknown>(path: string, data?: D): Promise<T> {
    const response = await this.client.post<T>(`/api${path}`, data);
    return response.data;
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
