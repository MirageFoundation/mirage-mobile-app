export const CONFETTI_PARTICLE_COUNT = 50;

export const CONFETTI_ANIMATION_CHANNELS = [
  "opacity",
  "rotate",
  "scale",
  "translateX",
  "translateY",
] as const;

type ConfettiAnimationChannel = (typeof CONFETTI_ANIMATION_CHANNELS)[number];

type ConfettiTimingPolicy = {
  driftLegDurationMs: number;
  driftRepeatCount: number;
  fadeDelayMs: number;
  fadeDurationMs: number;
  movementDurationMs: number;
  rotationDegrees: number;
  scaleLegDurationMs: number;
  staggerMs: number;
};

const DEFAULT_TIMING: ConfettiTimingPolicy = {
  driftLegDurationMs: 500,
  driftRepeatCount: 3,
  fadeDelayMs: 2000,
  fadeDurationMs: 1000,
  movementDurationMs: 3000,
  rotationDegrees: 1080,
  scaleLegDurationMs: 150,
  staggerMs: 30,
};

const REDUCED_MOTION_TIMING: ConfettiTimingPolicy = {
  driftLegDurationMs: 250,
  driftRepeatCount: 1,
  fadeDelayMs: 350,
  fadeDurationMs: 150,
  movementDurationMs: 500,
  rotationDegrees: 90,
  scaleLegDurationMs: 75,
  staggerMs: 2,
};

export function getConfettiTimingPolicy(reducedMotion: boolean) {
  return reducedMotion ? REDUCED_MOTION_TIMING : DEFAULT_TIMING;
}

export function getConfettiParticleDelay(
  index: number,
  reducedMotion: boolean,
) {
  if (!Number.isInteger(index) || index < 0 || index >= CONFETTI_PARTICLE_COUNT) {
    throw new RangeError(`Invalid confetti particle index: ${index}`);
  }

  return index * getConfettiTimingPolicy(reducedMotion).staggerMs;
}

export function getConfettiVisibilityDuration(reducedMotion: boolean) {
  const timing = getConfettiTimingPolicy(reducedMotion);
  return (
    getConfettiParticleDelay(CONFETTI_PARTICLE_COUNT - 1, reducedMotion) +
    timing.fadeDelayMs +
    timing.fadeDurationMs
  );
}

export function cancelConfettiAnimationChannels<T>(
  channels: Record<ConfettiAnimationChannel, T>,
  cancel: (channel: T) => void,
) {
  for (const channel of CONFETTI_ANIMATION_CHANNELS) {
    cancel(channels[channel]);
  }
}
