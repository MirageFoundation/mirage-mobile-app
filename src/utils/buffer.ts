import { Buffer } from "buffer";

// Global Buffer Polyfill
global.Buffer = Buffer;

// Patch: Explicitly restore prototype for subarray to ensure methods like readUIntLE work
Buffer.prototype.subarray = function subarray(
  begin: number | undefined,
  end: number | undefined,
) {
  const result = Uint8Array.prototype.subarray.apply(this, [begin, end]);
  Object.setPrototypeOf(result, Buffer.prototype); 
  return result;
};
