export type VideoUploadEntry = {
  url: string | null;
  uploading: boolean;
  progress: number;
  error: string | null;
  isServerError?: boolean;
  sessionId?: number;
};

export type ImageUploadEntry = {
  url: string | null;
  uploading: boolean;
  progress: number;
  error: string | null;
  isServerError?: boolean;
  promise?: Promise<string>;
};

export type VideoMeta = {
  originalUri: string;
  width: number;
  height: number;
  trimStart: number;
  trimEnd: number;
};

export const VIDEO_UPLOADS = new Map<string, VideoUploadEntry>();
export const IMAGE_UPLOADS = new Map<string, ImageUploadEntry>();
export const VIDEO_META = new Map<string, VideoMeta>();

let handledVideoParam: string | null = null;

export function getHandledVideoParam(): string | null {
  return handledVideoParam;
}

export function setHandledVideoParam(value: string | null): void {
  handledVideoParam = value;
}
