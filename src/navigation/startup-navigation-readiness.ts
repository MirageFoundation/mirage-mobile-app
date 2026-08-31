let isStartupHomeReady = false;
let resolveStartupHomeReady: (() => void) | null = null;
let startupHomeReadyPromise = createStartupHomeReadyPromise();

function createStartupHomeReadyPromise(): Promise<void> {
  return new Promise<void>((resolve) => {
    resolveStartupHomeReady = resolve;
  });
}

export function signalStartupHomeReady(): void {
  if (isStartupHomeReady) return;
  isStartupHomeReady = true;
  resolveStartupHomeReady?.();
  resolveStartupHomeReady = null;
}

export function waitForStartupHomeReady(): Promise<void> {
  return isStartupHomeReady ? Promise.resolve() : startupHomeReadyPromise;
}

export function resetStartupHomeReady(): void {
  if (!isStartupHomeReady) return;
  isStartupHomeReady = false;
  startupHomeReadyPromise = createStartupHomeReadyPromise();
}
