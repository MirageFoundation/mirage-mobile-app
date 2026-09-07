import { Gesture } from "react-native-gesture-handler";
import { runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { shouldDismissMedia } from "@/src/utils/fullscreen-dismiss";

export function useMediaDismissGesture(onDismiss?: () => void, scale?: SharedValue<number>) {
  const offset = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const gesture = Gesture.Pan().enabled(!!onDismiss).maxPointers(1).manualActivation(true)
    .onTouchesDown((event) => {
      startX.value = event.allTouches[0]?.absoluteX ?? 0;
      startY.value = event.allTouches[0]?.absoluteY ?? 0;
    })
    .onTouchesMove((event, state) => {
      if (event.numberOfTouches !== 1 || (scale && scale.value > 1)) { state.fail(); return; }
      const touch = event.allTouches[0];
      if (!touch) return;
      const x = touch.absoluteX - startX.value;
      const y = touch.absoluteY - startY.value;
      if (Math.abs(x) > 12 || y < -8) state.fail();
      else if (y > 16 && y > Math.abs(x) * 1.5) state.activate();
    })
    .onUpdate((event) => { offset.value = Math.max(0, event.translationY); })
    .onEnd((event) => {
      if (onDismiss && shouldDismissMedia(event.translationX, event.translationY, event.velocityY)) runOnJS(onDismiss)();
    })
    .onFinalize(() => { offset.value = withTiming(0, { duration: 180 }); });
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  return { gesture, style };
}
