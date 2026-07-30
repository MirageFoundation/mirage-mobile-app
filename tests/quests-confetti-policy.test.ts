// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  cancelConfettiAnimationChannels,
  CONFETTI_ANIMATION_CHANNELS,
  CONFETTI_PARTICLE_COUNT,
  getConfettiParticleDelay,
  getConfettiTimingPolicy,
  getConfettiVisibilityDuration,
} from "../src/pages/quests/quests-confetti-policy";

describe("quest confetti timing policy", () => {
  test("bounds every animation by the particle fade", () => {
    const timing = getConfettiTimingPolicy(false);
    const particleDuration = timing.fadeDelayMs + timing.fadeDurationMs;

    expect(timing.movementDurationMs).toBe(particleDuration);
    expect(
      timing.driftLegDurationMs * 2 * timing.driftRepeatCount,
    ).toBe(particleDuration);
    expect(timing.scaleLegDurationMs * 2).toBeLessThanOrEqual(
      particleDuration,
    );
    expect(getConfettiVisibilityDuration(false)).toBe(4470);
  });

  test("keeps particle stagger delays within the visibility window", () => {
    expect(getConfettiParticleDelay(0, false)).toBe(0);
    expect(getConfettiParticleDelay(CONFETTI_PARTICLE_COUNT - 1, false)).toBe(
      1470,
    );
    expect(() => getConfettiParticleDelay(-1, false)).toThrow(RangeError);
    expect(() =>
      getConfettiParticleDelay(CONFETTI_PARTICLE_COUNT, false),
    ).toThrow(RangeError);
  });

  test("shortens decorative movement when reduced motion is enabled", () => {
    const regular = getConfettiTimingPolicy(false);
    const reduced = getConfettiTimingPolicy(true);

    expect(reduced.movementDurationMs).toBe(500);
    expect(reduced.rotationDegrees).toBeLessThan(regular.rotationDegrees);
    expect(getConfettiVisibilityDuration(true)).toBe(598);
    expect(getConfettiVisibilityDuration(true)).toBeLessThan(
      getConfettiVisibilityDuration(false),
    );
  });

  test("cancels every channel before restart and again during cleanup", () => {
    const channels = Object.fromEntries(
      CONFETTI_ANIMATION_CHANNELS.map((channel) => [channel, channel]),
    );
    const cancelled: string[] = [];

    cancelConfettiAnimationChannels(channels, (channel) =>
      cancelled.push(`restart:${channel}`),
    );
    cancelConfettiAnimationChannels(channels, (channel) =>
      cancelled.push(`cleanup:${channel}`),
    );

    expect(cancelled).toEqual([
      ...CONFETTI_ANIMATION_CHANNELS.map((channel) => `restart:${channel}`),
      ...CONFETTI_ANIMATION_CHANNELS.map((channel) => `cleanup:${channel}`),
    ]);
  });
});
