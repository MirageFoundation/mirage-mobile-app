export function shouldDismissMedia(x: number, y: number, velocityY: number): boolean {
  "worklet";
  return y > 0 && y > Math.abs(x) * 1.5 && (y >= 120 || (y >= 48 && velocityY >= 900));
}
