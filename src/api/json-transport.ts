import { AxiosError, getAdapter, isAxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";

export function isRedirectError(error: unknown): boolean {
  const status = (error as { response?: { status?: number }; status?: number })
    ?.response?.status ?? (error as { status?: number })?.status;
  return typeof status === "number" && status >= 300 && status < 400;
}

const expoFetch: typeof fetch = async (input, init) => {
  const native = await import("expo/fetch");
  const signal = init?.signal;
  const preserveAbort = (error: unknown): never => {
    if (signal?.aborted && signal.reason) throw signal.reason;
    throw error;
  };
  try {
    const response = await native.fetch(input, { ...init, redirect: "manual" });
    // JSON only: retain Axios's signal/timeout until the native body is consumed.
    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      text: () => response.text().catch((error) => {
        // A broken redirect body must not turn a terminal 3xx into a retry.
        if (response.status >= 300 && response.status < 400) return "";
        return preserveAbort(error);
      }),
    } as Response;
  } catch (error) {
    return preserveAbort(error);
  }
};

export function createJsonTransport(fetchImplementation: typeof fetch = expoFetch): AxiosAdapter {
  return async (config) => {
    const guardedConfig = {
      ...config,
      responseType: "text" as const,
      // Avoid RN's global Request/XHR body conversion and Response stream wrapping.
      env: { ...config.env, fetch: fetchImplementation, Request: null, Response: null },
      fetchOptions: { ...config.fetchOptions, redirect: "manual" },
      // Settle outside the fetch adapter: installed AxiosError.from drops the
      // response when that adapter catches its own HTTP rejection.
      validateStatus: () => true,
    };
    try {
      // Axios 1.13 supports env injection/null constructors at runtime, but its
      // public getAdapter declaration omits the configuration argument.
      const resolveAdapter = getAdapter as unknown as (
        name: string, config: unknown,
      ) => AxiosAdapter;
      const response = await resolveAdapter("fetch", guardedConfig)(
        guardedConfig as unknown as InternalAxiosRequestConfig,
      );
      response.config = config;
      const status = response.status;
      if ((status >= 300 && status < 400) ||
        (status && config.validateStatus && !config.validateStatus(status))) {
        throw new AxiosError(
          `Request failed with status code ${status}`,
          status >= 500 ? "ERR_BAD_RESPONSE" : "ERR_BAD_REQUEST",
          config, response.request, response,
        );
      }
      return response;
    } catch (error) {
      // XHR used ECONNABORTED; preserve the existing client retry/telemetry policy.
      if (isAxiosError(error)) {
        error.config = config;
        if (error.code === "ETIMEDOUT") error.code = "ECONNABORTED";
      }
      throw error;
    }
  };
}

export const jsonTransport = createJsonTransport();
