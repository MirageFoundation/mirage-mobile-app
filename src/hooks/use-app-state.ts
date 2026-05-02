import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

export const APP_FOREGROUND_REFRESH_THRESHOLD_MS = 2 * 60 * 60 * 1000;

export type AppStateInfo = {
  currentState: AppStateStatus;
  previousState: AppStateStatus | null;
  lastActiveTime: number | null;
  lastBackgroundTime: number | null;
  isReturningFromBackground: boolean;
  backgroundDuration: number | null;
};

type UseAppStateOptions = {
  onForeground?: (info: { backgroundDuration: number }) => void;
  onBackground?: () => void;
  staleThreshold?: number;
};

export function useAppState(options: UseAppStateOptions = {}): AppStateInfo {
  const { onForeground, onBackground, staleThreshold = 0 } = options;

  const [appState, setAppState] = useState<AppStateStatus>(
    AppState.currentState
  );
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const previousStateRef = useRef<AppStateStatus | null>(null);
  const lastActiveTimeRef = useRef<number | null>(Date.now());
  const lastBackgroundTimeRef = useRef<number | null>(null);
  const backgroundDurationRef = useRef<number | null>(null);
  const isReturningRef = useRef(false);

  const onForegroundRef = useRef(onForeground);
  onForegroundRef.current = onForeground;
  const onBackgroundRef = useRef(onBackground);
  onBackgroundRef.current = onBackground;
  const staleThresholdRef = useRef(staleThreshold);
  staleThresholdRef.current = staleThreshold;

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        const prevState = appStateRef.current;
        previousStateRef.current = prevState;

        if (prevState === "active" && nextState.match(/inactive|background/)) {
          lastBackgroundTimeRef.current = Date.now();
          onBackgroundRef.current?.();
        }

        if (
          prevState.match(/inactive|background/) &&
          nextState === "active"
        ) {
          const now = Date.now();
          lastActiveTimeRef.current = now;

          if (lastBackgroundTimeRef.current) {
            const duration = now - lastBackgroundTimeRef.current;
            backgroundDurationRef.current = duration;

            if (duration >= staleThresholdRef.current) {
              isReturningRef.current = true;
              onForegroundRef.current?.({ backgroundDuration: duration });
            }
          }
        } else {
          isReturningRef.current = false;
        }

        appStateRef.current = nextState;
        setAppState(nextState);
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

  return {
    currentState: appState,
    previousState: previousStateRef.current,
    lastActiveTime: lastActiveTimeRef.current,
    lastBackgroundTime: lastBackgroundTimeRef.current,
    isReturningFromBackground: isReturningRef.current,
    backgroundDuration: backgroundDurationRef.current,
  };
}
