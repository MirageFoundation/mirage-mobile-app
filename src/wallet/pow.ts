// Pure proof-of-work math helpers.
// Argon2 hashing itself lives in ./pow-turbo (react-native-argon2-turbo).

// ============================================
// Types
// ============================================

export interface PoWParams {
  difficulty: number;
  messageHash: Uint8Array;
  timestamp: number;
  lastBlockHash: string;
}

// ============================================
// Uvarint Encoding
// ============================================

export function uvarint(n: number | bigint): Uint8Array {
  const result: number[] = [];
  let value = typeof n === "bigint" ? n : BigInt(n);

  while (value >= 0x80n) {
    result.push(Number(value & 0x7fn) | 0x80);
    value >>= 7n;
  }
  result.push(Number(value));

  return new Uint8Array(result);
}

// ============================================
// Target-Based Difficulty (v1.11.0)
// ============================================

const BASE_DIFFICULTY_FACTOR = 1000n;
const MAX_SAFE_DIFFICULTY_FACTOR = (1n << 53n) - 1n;

export function difficultyFactor(steps: number, powFactor: number): bigint {
  if (steps === 0) return BASE_DIFFICULTY_FACTOR;
  let factor = 1000;
  for (let i = 0; i < steps; i++) {
    factor *= (1 + powFactor);
  }
  let rounded = BigInt(Math.round(factor));
  if (rounded < BASE_DIFFICULTY_FACTOR) rounded = BASE_DIFFICULTY_FACTOR;
  if (rounded > MAX_SAFE_DIFFICULTY_FACTOR) rounded = MAX_SAFE_DIFFICULTY_FACTOR;
  return rounded;
}

export function checkPowTarget(
  digestBytes: Uint8Array,
  powDifficulty: number,
  powBaseBits: number,
  powFactor: number
): boolean {
  const factor = difficultyFactor(powDifficulty, powFactor);
  const baseTarget = 1n << BigInt(256 - powBaseBits);
  const effectiveTarget = (baseTarget * BASE_DIFFICULTY_FACTOR) / factor;

  let hashInt = 0n;
  for (const byte of digestBytes) {
    hashInt = (hashInt << 8n) | BigInt(byte);
  }

  return hashInt <= effectiveTarget;
}

export function leadingZeroBits(bytes: Uint8Array): number {
  let total = 0;
  for (const b of bytes) {
    if (b === 0) {
      total += 8;
      continue;
    }
    for (let i = 7; i >= 0; i--) {
      if (((b >> i) & 1) === 0) {
        total++;
      } else {
        return total;
      }
    }
  }
  return total;
}
