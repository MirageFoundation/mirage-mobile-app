import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  hash(
    password: string,
    salt: string,
    iterations: number,
    memory: number,
    parallelism: number,
    hashLength: number,
    mode: string,
    passwordEncoding: string,
    saltEncoding: string
  ): Promise<{ rawHash: string; encodedHash: string }>;

  hashSync(
    password: string,
    salt: string,
    iterations: number,
    memory: number,
    parallelism: number,
    hashLength: number,
    mode: string,
    passwordEncoding: string,
    saltEncoding: string
  ): { rawHash: string; encodedHash: string };

  verify(password: string, encodedHash: string): Promise<boolean>;

  computePow(
    base: string,
    salt: string,
    difficulty: number,
    startNonce: number,
    maxAttempts: number,
    timeoutMs: number,
    iterations: number,
    memory: number,
    parallelism: number,
    hashLength: number
  ): Promise<{
    nonce: number;
    digest: string;
    attempts: number;
    elapsedMs: number;
  }>;

  cancelPow(): void;

  getPowProgress(): Promise<{
    attempts: number;
    elapsedMs: number;
    hashesPerSecond: number;
  }>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Argon2Turbo');
