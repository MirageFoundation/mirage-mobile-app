export type ShareIntentFileLike = {
  path?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  size?: number | null;
};

export type ShareIntentLike = {
  type?: string | null;
  text?: string | null;
  webUrl?: string | null;
  files?: ShareIntentFileLike[] | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function normalizeFile(value: unknown): ShareIntentFileLike | null {
  if (!isRecord(value)) return null;
  if (
    !isOptionalString(value.path) ||
    !isOptionalString(value.mimeType) ||
    !isOptionalString(value.fileName) ||
    !(
      value.size === undefined ||
      value.size === null ||
      (typeof value.size === "number" && Number.isFinite(value.size))
    )
  ) {
    return null;
  }

  if (typeof value.path !== "string" || value.path.trim().length === 0) {
    return null;
  }

  return {
    path: value.path,
    mimeType: value.mimeType,
    fileName: value.fileName,
    size: value.size,
  };
}

export function normalizeShareIntent(value: unknown): ShareIntentLike | null {
  let candidate: unknown = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  if (!isRecord(candidate)) return null;
  if (
    !isOptionalString(candidate.type) ||
    !isOptionalString(candidate.text) ||
    !isOptionalString(candidate.webUrl) ||
    !(
      candidate.files === undefined ||
      candidate.files === null ||
      Array.isArray(candidate.files)
    )
  ) {
    return null;
  }

  const files = Array.isArray(candidate.files)
    ? candidate.files
        .map(normalizeFile)
        .filter((file): file is ShareIntentFileLike => file !== null)
    : candidate.files;
  const hasPayload =
    (typeof candidate.text === "string" && candidate.text.trim().length > 0) ||
    (typeof candidate.webUrl === "string" && candidate.webUrl.trim().length > 0) ||
    (Array.isArray(files) && files.length > 0);

  if (!hasPayload) return null;

  return {
    type: candidate.type,
    text: candidate.text,
    webUrl: candidate.webUrl,
    files,
  };
}
