import { useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { runOnJS, useSharedValue, type SharedValue } from "react-native-reanimated";
import { canStartPostDetailDismiss, resolvePostDetailPull, shouldDismissPostDetail } from "./post-detail-dismiss";

export function usePostDetailDismiss(scrollY: SharedValue<number>, enabled: boolean, onBack: () => void) {
  const { height } = useReanimatedKeyboardAnimation();
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startedAt = useSharedValue(0);
  const eligible = useSharedValue(false);
  const active = useSharedValue(false);
  const blocked = useSharedValue(false);
  const dismissed = useSharedValue(false);
  const native = useMemo(() => Gesture.Native(), []);
  const pan = Gesture.Pan().enabled(enabled).maxPointers(1).manualActivation(true)
    .simultaneousWithExternalGesture(native)
    .onTouchesDown((event, state) => {
      eligible.value = !dismissed.value && canStartPostDetailDismiss(scrollY.value, height.value);
      if (!eligible.value || event.numberOfTouches !== 1) { state.fail(); return; }
      startX.value = event.allTouches[0].absoluteX;
      startY.value = event.allTouches[0].absoluteY;
      startedAt.value = Date.now();
    })
    .onStart(() => { active.value = true; })
    .onTouchesMove((event, state) => {
      if (blocked.value || event.numberOfTouches !== 1 || !eligible.value || !canStartPostDetailDismiss(scrollY.value, height.value)) { state.fail(); return; }
      if (active.value) return;
      const touch = event.allTouches[0];
      if (!touch) return;
      const action = resolvePostDetailPull(touch.absoluteX - startX.value, touch.absoluteY - startY.value,
        event.numberOfTouches, Date.now() - startedAt.value);
      if (action === "fail") state.fail();
      else if (action === "activate") state.activate();
    })
    .onEnd((event, success) => {
      if (success && !blocked.value && !dismissed.value && shouldDismissPostDetail(eligible.value, scrollY.value, height.value,
        event.translationX, event.translationY, event.velocityY)) {
        dismissed.value = true;
        runOnJS(onBack)();
      }
    })
    .onFinalize(() => { eligible.value = false; active.value = false; });
  return { pan, native, blocked };
}
