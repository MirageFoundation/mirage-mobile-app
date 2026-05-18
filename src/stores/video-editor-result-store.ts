export type PendingVideoResult = {
  videoUri: string;
  originalVideoUri: string;
  videoWidth: number;
  videoHeight: number;
  trimStart: number;
  trimEnd: number;
  replacingUri: string;
} | null;

let pendingVideoResult: PendingVideoResult = null;

export function setPendingVideoResult(result: Exclude<PendingVideoResult, null>): void {
  pendingVideoResult = result;
}

export function consumePendingVideoResult(): PendingVideoResult {
  const result = pendingVideoResult;
  pendingVideoResult = null;
  return result;
}
