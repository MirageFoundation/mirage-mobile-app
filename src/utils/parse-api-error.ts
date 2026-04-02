import * as Sentry from "@sentry/react-native";
import {
 getErrorMessage,
 isRetryable,
 isMaybeRetryable,
 isKnownErrorCode,
 DEFAULT_MESSAGE,
} from "@/src/utils/error-messages";

export interface ApiError {
 errorCode: string | null;
 message: string;
 httpStatus: number | null;
 retryable: boolean;
 context: Record<string, unknown>;
 raw: unknown;
}

export function parseApiError(error: unknown): ApiError {
 const axiosError = error as any;
 const data = axiosError?.response?.data;
 const httpStatus: number | null = axiosError?.response?.status ?? null;

 if (!data || typeof data !== "object") {
  return {
   errorCode: null,
   message: DEFAULT_MESSAGE,
   httpStatus,
   retryable: false,
   context: {},
   raw: error,
  };
 }

 const errorCode: string | null = data.error_code ?? null;

 if (!errorCode) {
  Sentry.addBreadcrumb({
   category: "api.error",
   message: `Missing error_code in response: ${JSON.stringify(data)}`,
   level: "warning",
  });
  return {
   errorCode: null,
   message: DEFAULT_MESSAGE,
   httpStatus,
   retryable: false,
   context: {},
   raw: error,
  };
 }

 if (!isKnownErrorCode(errorCode)) {
  Sentry.addBreadcrumb({
   category: "api.error",
   message: `Unknown error_code: ${errorCode}`,
   level: "warning",
  });
 }

 const { error: _err, error_code: _code, ...context } = data;

 return {
  errorCode,
  message: getErrorMessage(errorCode),
  httpStatus,
  retryable: isRetryable(errorCode) || isMaybeRetryable(errorCode),
  context,
  raw: error,
 };
}

export function getApiErrorMessage(error: unknown): string {
 return parseApiError(error).message;
}

export function isNetworkError(error: unknown): boolean {
 const axiosError = error as any;
 return (
  axiosError?.code === "ERR_NETWORK" ||
  axiosError?.message === "Network Error" ||
  !axiosError?.response
 );
}
