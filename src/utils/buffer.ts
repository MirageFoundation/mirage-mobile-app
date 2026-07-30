import { Buffer } from "buffer";

// Global Buffer Polyfill
(globalThis as { Buffer?: typeof Buffer }).Buffer = Buffer;

// Patch: Explicitly restore prototype for subarray to ensure methods like readUIntLE work
Buffer.prototype.subarray = function subarray(
  this: Buffer,
  begin?: number,
  end?: number,
) {
  const result = Uint8Array.prototype.subarray.call(this, begin, end);
  Object.setPrototypeOf(result, Buffer.prototype);
  return result as Buffer;
};
