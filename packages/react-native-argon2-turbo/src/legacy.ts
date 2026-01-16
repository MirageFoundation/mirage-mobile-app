import { hash } from './hash';
import type { Argon2Mode, HashResult } from './types';

export interface LegacyOptions {
  iterations?: number;
  memory?: number;
  parallelism?: number;
  hashLength?: number;
  mode?: Argon2Mode;
}

async function argon2(
  password: string,
  salt: string,
  options: LegacyOptions = {}
): Promise<HashResult> {
  return hash({
    password,
    salt,
    ...options,
  });
}

export default argon2;
