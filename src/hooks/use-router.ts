import { useCallback, useRef } from "react";
import { useRouter as useExpoRouter } from "expo-router";

const GUARD_MS = 500;

export const useRouter = () => {
  const router = useExpoRouter();
  const lastNavRef = useRef(0);

  const guard = useCallback(<T extends (...args: any[]) => any>(fn: T) => {
    return ((...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastNavRef.current < GUARD_MS) return;
      lastNavRef.current = now;
      return fn(...args);
    }) as T;
  }, []);

  return {
    ...router,
    push: guard(router.push),
    navigate: guard(router.navigate),
    replace: guard(router.replace),
  };
};
