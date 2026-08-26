/**
 * Toast Provider
 *
 * Provides global toast notification functionality throughout the app.
 * Use the `useToast` hook to show toasts from any component.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform, StyleSheet, View } from "react-native";
import { FullWindowOverlay } from "react-native-screens";
import * as Sentry from "@sentry/react-native";

import { ToastContainer, type ToastData, type ToastType } from "@/src/components/ui/toast";

// ============================================
// Types
// ============================================

interface ToastOptions {
  title: string;
  description?: string;
  duration?: number;
  action?: () => void;
}

interface ToastContextValue {
  /** Show a toast notification */
  show: (type: ToastType, options: ToastOptions) => string;
  /** Show a loading toast (persistent until dismissed) */
  loading: (title: string, description?: string) => string;
  /** Show a success toast */
  success: (title: string, description?: string) => string;
  /** Show an error toast */
  error: (title: string, description?: string) => string;
  /** Show an info toast */
  info: (title: string, description?: string) => string;
  /** Update an existing toast */
  update: (id: string, options: Partial<ToastData>) => void;
  /** Dismiss a specific toast */
  dismiss: (id: string) => void;
  /** Dismiss all toasts */
  dismissAll: () => void;
  /** Promise-based toast that updates based on promise state */
  promise: <T>(
    promise: Promise<T>,
    options: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: unknown) => string);
    }
  ) => Promise<T>;
}

// ============================================
// Context
// ============================================

const ToastContext = createContext<ToastContextValue | null>(null);

// ============================================
// Hook
// ============================================

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

// ============================================
// Provider
// ============================================

const DEFAULT_DURATION = 4000; // 4 seconds

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const idCounter = useRef(0);

  const generateId = useCallback(() => {
    idCounter.current += 1;
    return `toast-${idCounter.current}-${Date.now()}`;
  }, []);

  const show = useCallback(
    (type: ToastType, options: ToastOptions): string => {
      const id = generateId();
      const toast: ToastData = {
        id,
        type,
        title: options.title,
        description: options.description,
        duration: options.duration ?? (type === "loading" ? 0 : DEFAULT_DURATION),
        action: options.action,
      };

      setToasts((prev) => [...prev, toast]);
      return id;
    },
    [generateId]
  );

  const loading = useCallback(
    (title: string, description?: string): string => {
      return show("loading", { title, description, duration: 0 });
    },
    [show]
  );

  const success = useCallback(
    (title: string, description?: string): string => {
      return show("success", { title, description });
    },
    [show]
  );

  const error = useCallback(
    (title: string, description?: string): string => {
      return show("error", { title, description, duration: 5000 });
    },
    [show]
  );

  const info = useCallback(
    (title: string, description?: string): string => {
      return show("info", { title, description });
    },
    [show]
  );

  const update = useCallback((id: string, options: Partial<ToastData>) => {
    setToasts((prev) =>
      prev.map((toast) =>
        toast.id === id ? { ...toast, ...options } : toast
      )
    );
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const promiseToast = useCallback(
    async <T,>(
      promise: Promise<T>,
      options: {
        loading: string;
        success: string | ((data: T) => string);
        error: string | ((err: unknown) => string);
      }
    ): Promise<T> => {
      const id = loading(options.loading);

      try {
        const result = await promise;
        const successMessage =
          typeof options.success === "function"
            ? options.success(result)
            : options.success;

        update(id, {
          type: "success",
          title: successMessage,
          duration: DEFAULT_DURATION,
        });

        // Auto dismiss after duration
        setTimeout(() => dismiss(id), DEFAULT_DURATION);

        return result;
      } catch (err) {
        Sentry.addBreadcrumb({
          category: "toast",
          message: "Promise toast failed",
          data: { error: String(err) },
          level: "error",
        });

        const errorMessage =
          typeof options.error === "function"
            ? options.error(err)
            : options.error;

        update(id, {
          type: "error",
          title: errorMessage,
          duration: 5000,
        });

        // Auto dismiss after duration
        setTimeout(() => dismiss(id), 5000);

        throw err;
      }
    },
    [loading, update, dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      loading,
      success,
      error,
      info,
      update,
      dismiss,
      dismissAll,
      promise: promiseToast,
    }),
    [show, loading, success, error, info, update, dismiss, dismissAll, promiseToast]
  );

  const toastContent = <ToastContainer toasts={toasts} onDismiss={dismiss} />;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {Platform.OS === "ios" ? (
        <FullWindowOverlay>
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {toastContent}
          </View>
        </FullWindowOverlay>
      ) : (
        toastContent
      )}
    </ToastContext.Provider>
  );
}
