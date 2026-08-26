import { useCallback, useMemo } from "react";
import { router as expoRouter, useRouter as useExpoRouter } from "expo-router";
import * as Sentry from "@sentry/react-native";

import {
  createNavigationDeduplicator,
  type NavigationAction,
  type NavigationHref,
} from "./navigation-deduplication";

const GUARD_MS = 500;

type BypassOptions = {
  /**
   * When true, the next navigation call skips the dedup guard AND resets the
   * global last-nav timestamp so it cannot be suppressed by any in-flight
   * navigation. Intended for high-priority flows such as notification handling
   * and cold-start route recovery.
   */
  bypassGuard?: boolean;
};

const navigationDeduplicator = createNavigationDeduplicator(GUARD_MS);

function isBypassOptions(value: unknown): value is BypassOptions {
  return (
    !!value &&
    typeof value === "object" &&
    Object.prototype.hasOwnProperty.call(value, "bypassGuard")
  );
}

function extractBypass(args: unknown[]): { args: unknown[]; bypass: boolean } {
  if (args.length < 2) return { args, bypass: false };
  const last = args[args.length - 1];
  if (isBypassOptions(last)) {
    return { args: args.slice(0, -1), bypass: !!last.bypassGuard };
  }
  return { args, bypass: false };
}

/**
 * Reset the global navigation guard so the next dispatch always wins.
 * Use sparingly — intended for notification/share-intent recovery paths.
 */
export function resetNavigationGuard(reason: string): void {
  navigationDeduplicator.reset();
  Sentry.addBreadcrumb({
    category: "navigation",
    message: "Navigation guard reset",
    data: { reason },
    level: "info",
  });
}

function guard<T extends (...args: any[]) => any>(
  action: NavigationAction,
  fn: T,
): T {
  return ((...rawArgs: Parameters<T>) => {
    const { args, bypass } = extractBypass(rawArgs as unknown[]);
    const now = Date.now();

    // Only suppress when the SAME navigation target is repeated within the
    // guard window. Different targets must never suppress each other, e.g. a
    // notification's `navigate("/inbox")` should never be dropped just
    // because a share-intent `replace("/create")` just fired.
    if (
      navigationDeduplicator.shouldSuppress(
        action,
        args[0] as NavigationHref,
        now,
        bypass,
      )
    ) {
      Sentry.addBreadcrumb({
        category: "navigation",
        message: "Duplicate navigation suppressed",
        data: { action, guardMs: GUARD_MS },
        level: "info",
      });
      return;
    }

    try {
      Sentry.addBreadcrumb({
        category: "navigation",
        message: bypass
          ? "Navigation dispatched (guard bypassed)"
          : "Navigation dispatched",
        data: { action, bypass },
        level: "info",
      });
      return (fn as (...a: unknown[]) => unknown)(...args);
    } catch (error) {
      navigationDeduplicator.reset();
      Sentry.captureException(error, {
        tags: { feature: "navigation", action },
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

/**
 * High-priority navigation helpers that always win the guard. Use for
 * notification handling, share-intent recovery, and other flows where the
 * navigation must NOT be silently dropped by a recent unrelated dispatch.
 */
export const navigateBypass: typeof expoRouter.navigate = ((...args: unknown[]) =>
  (router.navigate as unknown as (...a: unknown[]) => unknown)(
    ...args,
    { bypassGuard: true },
  )) as typeof expoRouter.navigate;

export const replaceBypass: typeof expoRouter.replace = ((...args: unknown[]) =>
  (router.replace as unknown as (...a: unknown[]) => unknown)(
    ...args,
    { bypassGuard: true },
  )) as typeof expoRouter.replace;

export const pushBypass: typeof expoRouter.push = ((...args: unknown[]) =>
  (router.push as unknown as (...a: unknown[]) => unknown)(
    ...args,
    { bypassGuard: true },
  )) as typeof expoRouter.push;

export const useRouter = () => {
  const router = useExpoRouter();

  const guardHookNavigation = useCallback(
    <T extends (...args: any[]) => any>(action: NavigationAction, fn: T) =>
      guard(action, fn),
    [],
  );

  return useMemo(
    () => ({
      ...router,
      push: guardHookNavigation("push", router.push),
      navigate: guardHookNavigation("navigate", router.navigate),
      replace: guardHookNavigation("replace", router.replace),
    }),
    [router, guardHookNavigation],
  );
};
