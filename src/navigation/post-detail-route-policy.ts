import { STARTUP_HOME_ROUTE } from "@/src/navigation/startup-route-policy";

export const POST_DETAIL_HOME_ROUTE = STARTUP_HOME_ROUTE;

export const POST_DETAIL_STACK_GESTURE_OPTIONS = {
  gestureEnabled: false,
  fullScreenGestureEnabled: false,
} as const;

export function resolvePostDetailExitAction(
  canGoBack: boolean,
): "back" | "replace_home" {
  return canGoBack ? "back" : "replace_home";
}
