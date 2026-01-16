import NativeArgon2Turbo from './NativeArgon2Turbo';
import type { PowOptions, PowProgress, PowResult } from './types';

const DEFAULT_MAX_ATTEMPTS = 10_000_000;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_ITERATIONS = 1;
const DEFAULT_MEMORY = 4096;
const DEFAULT_PARALLELISM = 1;
const DEFAULT_HASH_LENGTH = 32;

export async function computePow(options: PowOptions): Promise<PowResult> {
  const {
    base,
    salt,
    difficulty,
    startNonce = Math.floor(Math.random() * 0xffffffff),
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    iterations = DEFAULT_ITERATIONS,
    memory = DEFAULT_MEMORY,
    parallelism = DEFAULT_PARALLELISM,
    hashLength = DEFAULT_HASH_LENGTH,
  } = options;

  return NativeArgon2Turbo.computePow(
    base,
    salt,
    difficulty,
    startNonce,
    maxAttempts,
    timeoutMs,
    iterations,
    memory,
    parallelism,
    hashLength
  );
}

export function cancelPow(): void {
  NativeArgon2Turbo.cancelPow();
}

export async function getPowProgress(): Promise<PowProgress> {
  return NativeArgon2Turbo.getPowProgress();
}
