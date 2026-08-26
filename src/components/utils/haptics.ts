import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Utility functions for haptic feedback using expo-haptics
 */

export type HapticFeedbackType =
  | "light"
  | "medium"
  | "heavy"
  | "selection"
  | "success"
  | "warning"
  | "error"
  | "none";

export interface HapticConfig {
  in?: HapticFeedbackType;
  out?: HapticFeedbackType;
}

let didWarnUnsupportedHaptics = false;

function isUnsupportedHapticsError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("performhapticsasync") ||
    message.includes("a haptics engine is not available on this device") ||
    message.includes("haptics engine is not available")
  );
}

function safelyTriggerHaptic(run: () => Promise<void>): void {
  void run().catch((error) => {
    if (isUnsupportedHapticsError(error)) {
      if (!didWarnUnsupportedHaptics) {
        didWarnUnsupportedHaptics = true;
        console.warn("[Haptics] Haptics engine unavailable on this device, skipping feedback");
      }
      return;
    }

    console.warn("[Haptics] Failed to trigger feedback:", error);
  });
}

function runAndroidHaptic(style: Haptics.AndroidHaptics): void {
  if (Platform.OS !== "android") {
    return;
  }

  safelyTriggerHaptic(() => Haptics.performAndroidHapticsAsync(style));
}

function runImpact(style: Haptics.ImpactFeedbackStyle): void {
  safelyTriggerHaptic(() => Haptics.impactAsync(style));
}

function runNotification(type: Haptics.NotificationFeedbackType): void {
  safelyTriggerHaptic(() => Haptics.notificationAsync(type));
}

/**
 * Triggers a light impact haptic feedback
 */
export const lightImpact = () => {
  if (Platform.OS === "android") {
    runAndroidHaptic(Haptics.AndroidHaptics.Keyboard_Tap);
  } else {
    runImpact(Haptics.ImpactFeedbackStyle.Light);
  }
};

/**
 * Triggers a medium impact haptic feedback
 */
export const mediumImpact = () => {
  if (Platform.OS === "android") {
    runAndroidHaptic(Haptics.AndroidHaptics.Context_Click);
  } else {
    runImpact(Haptics.ImpactFeedbackStyle.Medium);
  }
};

/**
 * Triggers a heavy impact haptic feedback
 */
export const heavyImpact = () => {
  if (Platform.OS === "android") {
    runAndroidHaptic(Haptics.AndroidHaptics.Long_Press);
  } else {
    runImpact(Haptics.ImpactFeedbackStyle.Heavy);
  }
};

/**
 * Triggers a success notification haptic feedback
 */
export const successNotification = () => {
  if (Platform.OS === "android") {
    runAndroidHaptic(Haptics.AndroidHaptics.Confirm);
  } else {
    runNotification(Haptics.NotificationFeedbackType.Success);
  }
};

/**
 * Triggers a warning notification haptic feedback
 */
export const warningNotification = () => {
  if (Platform.OS === "android") {
    runAndroidHaptic(Haptics.AndroidHaptics.Reject);
  } else {
    runNotification(Haptics.NotificationFeedbackType.Warning);
  }
};

/**
 * Triggers an error notification haptic feedback
 */
export const errorNotification = () => {
  if (Platform.OS === "android") {
    runAndroidHaptic(Haptics.AndroidHaptics.Reject);
  } else {
    runNotification(Haptics.NotificationFeedbackType.Error);
  }
};

/**
 * Triggers a selection feedback
 */
export const selection = () => {
  if (Platform.OS === "android") {
    runAndroidHaptic(Haptics.AndroidHaptics.Clock_Tick);
  } else {
    safelyTriggerHaptic(() => Haptics.selectionAsync());
  }
};

/**
 * Triggers the specified haptic feedback type
 */
export const triggerHaptic = (type: HapticFeedbackType, disabled?: boolean) => {
  if (disabled) return;

  switch (type) {
    case "light":
      lightImpact();
      break;
    case "medium":
      mediumImpact();
      break;
    case "heavy":
      heavyImpact();
      break;
    case "selection":
      selection();
      break;
    case "success":
      successNotification();
      break;
    case "warning":
      warningNotification();
      break;
    case "error":
      errorNotification();
      break;
    case "none":
    default:
      break;
  }
};

/**
 * Android-specific haptic effects for more precise control
 */
export const androidHaptics = {
  clockTick: () => runAndroidHaptic(Haptics.AndroidHaptics.Clock_Tick),
  confirm: () => runAndroidHaptic(Haptics.AndroidHaptics.Confirm),
  contextClick: () => runAndroidHaptic(Haptics.AndroidHaptics.Context_Click),
  dragStart: () => runAndroidHaptic(Haptics.AndroidHaptics.Drag_Start),
  gestureEnd: () => runAndroidHaptic(Haptics.AndroidHaptics.Gesture_End),
  gestureStart: () => runAndroidHaptic(Haptics.AndroidHaptics.Gesture_Start),
  keyboardPress: () => runAndroidHaptic(Haptics.AndroidHaptics.Keyboard_Press),
  keyboardRelease: () => runAndroidHaptic(Haptics.AndroidHaptics.Keyboard_Release),
  keyboardTap: () => runAndroidHaptic(Haptics.AndroidHaptics.Keyboard_Tap),
  longPress: () => runAndroidHaptic(Haptics.AndroidHaptics.Long_Press),
  reject: () => runAndroidHaptic(Haptics.AndroidHaptics.Reject),
  segmentFrequentTick: () => runAndroidHaptic(Haptics.AndroidHaptics.Segment_Frequent_Tick),
  segmentTick: () => runAndroidHaptic(Haptics.AndroidHaptics.Segment_Tick),
  textHandleMove: () => runAndroidHaptic(Haptics.AndroidHaptics.Text_Handle_Move),
  toggleOff: () => runAndroidHaptic(Haptics.AndroidHaptics.Toggle_Off),
  toggleOn: () => runAndroidHaptic(Haptics.AndroidHaptics.Toggle_On),
  virtualKey: () => runAndroidHaptic(Haptics.AndroidHaptics.Virtual_Key),
  virtualKeyRelease: () => runAndroidHaptic(Haptics.AndroidHaptics.Virtual_Key_Release),
};

/**
 * Haptics utility object containing all haptic feedback functions
 */
const haptics = {
  lightImpact,
  mediumImpact,
  heavyImpact,
  successNotification,
  warningNotification,
  errorNotification,
  selection,
  triggerHaptic,
  androidHaptics,
};

export default haptics;
