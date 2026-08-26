export const YOUTUBE_PLAYER_ORIGIN = "https://www.youtube.com";
export const YOUTUBE_WEBVIEW_ORIGIN_WHITELIST = [YOUTUBE_PLAYER_ORIGIN];
export const YOUTUBE_BRIDGE_CHANNEL = "mirage.youtube-player.v1";

const BOOTSTRAP_URLS = new Set(["about:blank", "https://localhost", "https://localhost/"]);
const STATE_EVENT_TYPES = new Set([
  "ready",
  "playing",
  "paused",
  "ended",
  "buffering",
  "unstarted",
  "autoplayBlocked",
] as const);
const MAX_MESSAGE_LENGTH = 1_024;
const MAX_PLAYER_TIME_SECONDS = 604_800;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export type YouTubePlayerStateEvent =
  | "ready"
  | "playing"
  | "paused"
  | "ended"
  | "buffering"
  | "unstarted"
  | "autoplayBlocked";

export type YouTubePlayerMessage =
  | {
      channel: typeof YOUTUBE_BRIDGE_CHANNEL;
      nonce: string;
      type: YouTubePlayerStateEvent;
    }
  | {
      channel: typeof YOUTUBE_BRIDGE_CHANNEL;
      nonce: string;
      type: "timeUpdate";
      seconds: number;
    }
  | {
      channel: typeof YOUTUBE_BRIDGE_CHANNEL;
      nonce: string;
      type: "currentTime";
      seconds: number;
      requestId: string;
    };

export type YouTubeNavigationRequest = {
  url: string;
  isTopFrame: boolean;
  navigationType: string;
};

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function isBoundedPlayerTime(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_PLAYER_TIME_SECONDS
  );
}

export function isValidYouTubeVideoId(videoId: string): boolean {
  return VIDEO_ID_PATTERN.test(videoId);
}

export function isYouTubeBootstrapUrl(url: string): boolean {
  return BOOTSTRAP_URLS.has(url);
}

export function shouldAllowYouTubeNavigation(
  request: YouTubeNavigationRequest,
  bootstrapPending: boolean,
  videoId: string,
): boolean {
  if (request.navigationType !== "other") return false;

  if (request.isTopFrame) {
    return bootstrapPending && isYouTubeBootstrapUrl(request.url);
  }

  if (!isValidYouTubeVideoId(videoId)) return false;

  try {
    const url = new URL(request.url);
    return (
      url.protocol === "https:" &&
      url.hostname === "www.youtube.com" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === `/embed/${videoId}`
    );
  } catch {
    return false;
  }
}

export function parseYouTubePlayerMessage(
  raw: string,
  expectedNonce: string,
): YouTubePlayerMessage | null {
  if (raw.length === 0 || raw.length > MAX_MESSAGE_LENGTH || expectedNonce.length === 0) {
    return null;
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return null;
  }

  const message = value as Record<string, unknown>;
  if (
    message.channel !== YOUTUBE_BRIDGE_CHANNEL ||
    message.nonce !== expectedNonce ||
    typeof message.type !== "string"
  ) {
    return null;
  }

  if (STATE_EVENT_TYPES.has(message.type as YouTubePlayerStateEvent)) {
    return hasExactKeys(message, ["channel", "nonce", "type"])
      ? (message as YouTubePlayerMessage)
      : null;
  }

  if (message.type === "timeUpdate") {
    return hasExactKeys(message, ["channel", "nonce", "seconds", "type"]) &&
      isBoundedPlayerTime(message.seconds)
      ? (message as YouTubePlayerMessage)
      : null;
  }

  if (message.type === "currentTime") {
    return hasExactKeys(message, ["channel", "nonce", "requestId", "seconds", "type"]) &&
      isBoundedPlayerTime(message.seconds) &&
      typeof message.requestId === "string" &&
      REQUEST_ID_PATTERN.test(message.requestId)
      ? (message as YouTubePlayerMessage)
      : null;
  }

  return null;
}
