import { createContext, useContext, type ReactElement } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import type { SharedValue } from "react-native-reanimated";
import { View } from "react-native";

export const SwipeBackGestureContext = createContext<{
  pan: ReturnType<typeof Gesture.Pan>;
  native: ReturnType<typeof Gesture.Native>;
  blocked: SharedValue<boolean>;
} | null>(null);

// Wait for touches on interactive content to finish without claiming its responder.
export function SwipeBackGuard({ children, nativeChild = false }: { children: ReactElement; nativeChild?: boolean }) {
  const gestures = useContext(SwipeBackGestureContext);
  if (!gestures) return children;
  const { pan, native, blocked } = gestures;
  const guard = Gesture.Manual()
    .blocksExternalGesture(pan)
    .simultaneousWithExternalGesture(native)
    .onTouchesDown((_event, state) => { blocked.value = true; state.begin(); })
    .onTouchesUp((_event, state) => { state.fail(); })
    .onTouchesCancelled((_event, state) => { state.fail(); })
    .onFinalize(() => { blocked.value = false; });
  return (
    <GestureDetector gesture={guard}>
      {nativeChild ? children : <View collapsable={false}>{children}</View>}
    </GestureDetector>
  );
}
