let _lastPressedY = 0;

export type PressedMediaTransition = {
  postId: string;
  uri: string;
  previewUri?: string;
  positionSeconds?: number;
  wasPlaying?: boolean;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  createdAt: number;
};

let _lastPressedMediaTransition: PressedMediaTransition | null = null;

export function setLastPressedPostY(y: number) {
  _lastPressedY = y;
}

export function getLastPressedPostY(): number {
  const y = _lastPressedY;
  _lastPressedY = 0;
  return y;
}

export function setLastPressedMediaTransition(
  media: Omit<PressedMediaTransition, "createdAt">,
) {
  _lastPressedMediaTransition = {
    ...media,
    createdAt: Date.now(),
  };
}

export function getLastPressedMediaTransition(): PressedMediaTransition | null {
  const media = _lastPressedMediaTransition;
  _lastPressedMediaTransition = null;
  if (!media || Date.now() - media.createdAt > 1500) return null;
  return media;
}
