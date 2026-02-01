let _lastPressedY = 0;

export function setLastPressedPostY(y: number) {
  _lastPressedY = y;
}

export function getLastPressedPostY(): number {
  const y = _lastPressedY;
  _lastPressedY = 0;
  return y;
}
