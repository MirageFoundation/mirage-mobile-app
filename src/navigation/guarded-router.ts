import { router as expoRouter } from "expo-router";

const GUARD_MS = 500;
let lastNavTime = 0;

function guard<T extends (...args: any[]) => any>(fn: T): T {
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastNavTime < GUARD_MS) return;
    lastNavTime = now;
    try {
      return fn(...args);
    } catch (error) {
      lastNavTime = 0;
      throw error;
    }
  }) as T;
}

export const router = new Proxy(expoRouter, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (prop === "push" || prop === "navigate" || prop === "replace") {
      return guard(value as (...args: any[]) => any);
    }
    return value;
  },
});
