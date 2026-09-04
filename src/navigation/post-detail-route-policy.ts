import { STARTUP_HOME_ROUTE } from "@/src/navigation/startup-route-policy";

export const POST_DETAIL_HOME_ROUTE = STARTUP_HOME_ROUTE;

export const POST_DETAIL_STACK_GESTURE_OPTIONS = {
  gestureEnabled: false,
  fullScreenGestureEnabled: false,
} as const;

export const MEDIA_POST_DETAIL_SWIPE_LEAVE = {
  minTranslationY: 96,
  minVelocityY: 1200,
  minTranslationForFling: 48,
  activeOffsetY: 24,
  failOffsetX: 24,
} as const;

export function resolvePostDetailExitAction(
  canGoBack: boolean,
): "back" | "replace_home" {
  return canGoBack ? "back" : "replace_home";
}

export function resolveMediaPostDetailSwipeDown(
  collapseProgress: number,
): "expand" | "leave" {
  return collapseProgress > 0.1 ? "expand" : "leave";
}

export function isDeliberateMediaPostDetailSwipeDown(
  translationY: number,
  velocityY: number,
): boolean {
  "worklet";
  if (translationY >= MEDIA_POST_DETAIL_SWIPE_LEAVE.minTranslationY) return true;
  return (
    translationY >= MEDIA_POST_DETAIL_SWIPE_LEAVE.minTranslationForFling &&
    velocityY >= MEDIA_POST_DETAIL_SWIPE_LEAVE.minVelocityY
  );
}
