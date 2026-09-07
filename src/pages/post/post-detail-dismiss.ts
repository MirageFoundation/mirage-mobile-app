import { shouldDismissMedia } from "@/src/utils/fullscreen-dismiss";

export function canStartPostDetailDismiss(offset: number, keyboardHeight: number): boolean {
  "worklet";
  return offset <= 0 && keyboardHeight === 0;
}

export function resolvePostDetailPull(x: number, y: number, pointers: number, elapsed: number) {
  "worklet";
  if (pointers !== 1 || Math.abs(x) > 12 || y < -8 || elapsed >= 350) return "fail";
  return y > 16 && y > Math.abs(x) * 1.5 ? "activate" : "wait";
}

export function shouldDismissPostDetail(
  startedAtTop: boolean, offset: number, keyboardHeight: number,
  x: number, y: number, velocityY: number,
): boolean {
  "worklet";
  return startedAtTop && canStartPostDetailDismiss(offset, keyboardHeight) &&
    shouldDismissMedia(x, y, velocityY);
}
