import NativeArgon2Turbo from './NativeArgon2Turbo';
import type { HashOptions, HashResult, VerifyOptions } from './types';

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  // Use global btoa which is available in React Native
  return (globalThis as { btoa?: (s: string) => string }).btoa?.(binary) ?? binary;
}

function uint8ArrayToUtf8(bytes: Uint8Array): string {
  // Simple UTF-8 decode for ASCII-compatible strings
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i]!);
  }
  return result;
}

function encodeInput(
  input: string | Uint8Array,
  encoding: 'utf8' | 'hex' | 'base64'
): string {
  if (typeof input === 'string') {
    return input;
  }
  if (encoding === 'hex') {
    return Array.from(input)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  if (encoding === 'base64') {
    return uint8ArrayToBase64(input);
  }
  return uint8ArrayToUtf8(input);
}

const DEFAULT_ITERATIONS = 2;
const DEFAULT_MEMORY = 65536;
const DEFAULT_PARALLELISM = 1;
const DEFAULT_HASH_LENGTH = 32;
const DEFAULT_MODE = 'argon2id';
const DEFAULT_ENCODING = 'utf8';

export async function hash(options: HashOptions): Promise<HashResult> {
  const {
    password,
    salt,
    iterations = DEFAULT_ITERATIONS,
    memory = DEFAULT_MEMORY,
    parallelism = DEFAULT_PARALLELISM,
    hashLength = DEFAULT_HASH_LENGTH,
    mode = DEFAULT_MODE,
    passwordEncoding = DEFAULT_ENCODING,
    saltEncoding = DEFAULT_ENCODING,
  } = options;

  const encodedPassword = encodeInput(password, passwordEncoding);
  const encodedSalt = encodeInput(salt, saltEncoding);

  return NativeArgon2Turbo.hash(
    encodedPassword,
    encodedSalt,
    iterations,
    memory,
    parallelism,
    hashLength,
    mode,
    passwordEncoding,
    saltEncoding
  );
}

export function hashSync(options: HashOptions): HashResult {
  const {
    password,
    salt,
    iterations = DEFAULT_ITERATIONS,
    memory = DEFAULT_MEMORY,
    parallelism = DEFAULT_PARALLELISM,
    hashLength = DEFAULT_HASH_LENGTH,
    mode = DEFAULT_MODE,
    passwordEncoding = DEFAULT_ENCODING,
    saltEncoding = DEFAULT_ENCODING,
  } = options;

  const encodedPassword = encodeInput(password, passwordEncoding);
  const encodedSalt = encodeInput(salt, saltEncoding);

  return NativeArgon2Turbo.hashSync(
    encodedPassword,
    encodedSalt,
    iterations,
    memory,
    parallelism,
    hashLength,
    mode,
    passwordEncoding,
    saltEncoding
  );
}

export async function verify(options: VerifyOptions): Promise<boolean> {
  const { password, encodedHash } = options;
  return NativeArgon2Turbo.verify(password, encodedHash);
}
