import { useEffect, useRef, useState, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";

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
  const previousStateRef = useRef<AppStateStatus | null>(null);
  const lastActiveTimeRef = useRef<number | null>(Date.now());
  const lastBackgroundTimeRef = useRef<number | null>(null);
  const backgroundDurationRef = useRef<number | null>(null);
  const isReturningRef = useRef(false);

  const handleAppStateChange = useCallback(
    (nextState: AppStateStatus) => {
      const prevState = appState;
      previousStateRef.current = prevState;

      if (prevState === "active" && nextState.match(/inactive|background/)) {
        lastBackgroundTimeRef.current = Date.now();
        onBackground?.();
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

          if (duration >= staleThreshold) {
            isReturningRef.current = true;
            onForeground?.({ backgroundDuration: duration });
          }
        }
      } else {
        isReturningRef.current = false;
      }

      setAppState(nextState);
    },
    [appState, onForeground, onBackground, staleThreshold]
  );

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => {
      subscription.remove();
    };
  }, [handleAppStateChange]);

  return {
    currentState: appState,
    previousState: previousStateRef.current,
    lastActiveTime: lastActiveTimeRef.current,
    lastBackgroundTime: lastBackgroundTimeRef.current,
    isReturningFromBackground: isReturningRef.current,
    backgroundDuration: backgroundDurationRef.current,
  };
}
