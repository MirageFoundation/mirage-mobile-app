import { router as expoRouter, useRouter as useExpoRouter } from "expo-router";
import { useCallback, useRef } from "react";

const GUARD_MS = 500;
let lastNavTime = 0;

function createGuardedFn<T extends (...args: any[]) => any>(
  fn: T,
  getLastNavTime: () => number,
  setLastNavTime: (value: number) => void,
): T {
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - getLastNavTime() < GUARD_MS) {
      return;
    }
    setLastNavTime(now);
    return fn(...args);
  }) as T;
}

export function useRouter() {
  const router = useExpoRouter();
  const lastNavRef = useRef(0);

  const guard = useCallback(
    <T extends (...args: any[]) => any>(fn: T) =>
      createGuardedFn(
        fn,
        () => lastNavRef.current,
        (value) => {
          lastNavRef.current = value;
        },
      ),
    [],
  );

  return {
    ...router,
    push: guard(router.push),
    navigate: guard(router.navigate),
    replace: guard(router.replace),
  };
}

export const router = new Proxy(expoRouter, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (prop === "push" || prop === "navigate" || prop === "replace") {
      return createGuardedFn(
        value as (...args: any[]) => any,
        () => lastNavTime,
        (nextValue) => {
          lastNavTime = nextValue;
        },
      );
    }
    return value;
  },
});
