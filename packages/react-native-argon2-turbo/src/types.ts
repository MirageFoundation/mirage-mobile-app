export type Argon2Mode = 'argon2i' | 'argon2d' | 'argon2id';
export type Encoding = 'utf8' | 'hex' | 'base64';

export interface HashOptions {
  password: string | Uint8Array;
  salt: string | Uint8Array;
  iterations?: number;
  memory?: number;
  parallelism?: number;
  hashLength?: number;
  mode?: Argon2Mode;
  passwordEncoding?: Encoding;
  saltEncoding?: Encoding;
}

export interface HashResult {
  rawHash: string;
  encodedHash: string;
}

export interface VerifyOptions {
  password: string;
  encodedHash: string;
}

export interface PowOptions {
  base: string;
  salt: string;
  difficulty: number;
  startNonce?: number;
  maxAttempts?: number;
  timeoutMs?: number;
  iterations?: number;
  memory?: number;
  parallelism?: number;
  hashLength?: number;
}

export interface PowResult {
  nonce: number;
  digest: string;
  attempts: number;
  elapsedMs: number;
}

export interface PowProgress {
  attempts: number;
  elapsedMs: number;
  hashesPerSecond: number;
}
