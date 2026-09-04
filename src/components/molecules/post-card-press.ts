export function shouldTriggerPostCardPressHaptic(
  onPress?: (() => void) | null,
): boolean {
  return typeof onPress === "function";
}
