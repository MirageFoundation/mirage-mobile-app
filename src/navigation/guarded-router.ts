import { useCallback, useRef } from "react";
import { router as expoRouter, useRouter as useExpoRouter } from "expo-router";
import * as Sentry from "@sentry/react-native";

const GUARD_MS = 500;
let lastNavTime = 0;

type NavigationAction = "push" | "navigate" | "replace";

function describeNavigationTarget(args: unknown[]): string {
  const target = args[0];
  if (typeof target === "string") return target;
  if (target && typeof target === "object") {
    const record = target as Record<string, unknown>;
    if (typeof record.pathname === "string") return record.pathname;
  }
  return typeof target;
}

function guard<T extends (...args: any[]) => any>(action: NavigationAction, fn: T): T {
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    const target = describeNavigationTarget(args);
    if (now - lastNavTime < GUARD_MS) {
      Sentry.addBreadcrumb({
        category: "navigation",
        message: "Duplicate navigation suppressed",
        data: { action, target, guardMs: GUARD_MS },
        level: "info",
      });
      return;
    }
    lastNavTime = now;
    try {
      Sentry.addBreadcrumb({
        category: "navigation",
        message: "Navigation dispatched",
        data: { action, target },
        level: "info",
      });
      return fn(...args);
    } catch (error) {
      lastNavTime = 0;
      Sentry.captureException(error, {
        tags: { feature: "navigation", action },
        extra: { target, args },
      });
      throw error;
    }
  }) as T;
}

export const router = new Proxy(expoRouter, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (prop === "push" || prop === "navigate" || prop === "replace") {
      return guard(prop, value as (...args: any[]) => any);
    }
    return value;
  },
});

export const useRouter = () => {
  const router = useExpoRouter();
  const lastNavRef = useRef(0);

  const guardHookNavigation = useCallback(<T extends (...args: any[]) => any>(action: NavigationAction, fn: T) => {
    return ((...args: Parameters<T>) => {
      const now = Date.now();
      const target = describeNavigationTarget(args);
      if (now - lastNavRef.current < GUARD_MS) {
        Sentry.addBreadcrumb({
          category: "navigation",
          message: "Duplicate navigation suppressed",
          data: { action, target, guardMs: GUARD_MS },
          level: "info",
        });
        return;
      }
      lastNavRef.current = now;
      try {
        Sentry.addBreadcrumb({
          category: "navigation",
          message: "Navigation dispatched",
          data: { action, target },
          level: "info",
        });
        return fn(...args);
      } catch (error) {
        lastNavRef.current = 0;
        Sentry.captureException(error, {
          tags: { feature: "navigation", action },
          extra: { target, args },
        });
        throw error;
      }
    }) as T;
  }, []);

  return {
    ...router,
    push: guardHookNavigation("push", router.push),
    navigate: guardHookNavigation("navigate", router.navigate),
    replace: guardHookNavigation("replace", router.replace),
  };
};
