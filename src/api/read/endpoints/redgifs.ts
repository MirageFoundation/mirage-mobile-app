export type RedgifsMedia = {
  videoUrl: string;
  posterUrl?: string;
  width?: number;
  height?: number;
};

type RedgifsApiResponse = {
  gif?: {
    width?: number;
    height?: number;
    urls?: {
      sd?: string;
      hd?: string;
      silent?: string;
      poster?: string;
      thumbnail?: string;
    };
  };
};

let temporaryToken: string | null = null;
let temporaryTokenExpiresAt = 0;

async function getTemporaryToken(signal?: AbortSignal): Promise<string> {
  if (temporaryToken && temporaryTokenExpiresAt > Date.now() + 60_000) {
    return temporaryToken;
  }

  const response = await fetch("https://api.redgifs.com/v2/auth/temporary", {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Redgifs authentication failed (${response.status})`);
  }

  const data = await response.json() as { token?: string };
  if (!data.token) throw new Error("Redgifs authentication returned no token");

  temporaryToken = data.token;
  // Temporary tokens currently last 24 hours. Refresh a little earlier and
  // retry once on 401 in case Redgifs changes that lifetime.
  temporaryTokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000;
  return data.token;
}

async function requestRedgifsMedia(
  id: string,
  signal?: AbortSignal,
  retryAuthentication = true,
): Promise<RedgifsMedia> {
  const token = await getTemporaryToken(signal);
  const response = await fetch(
    `https://api.redgifs.com/v2/gifs/${encodeURIComponent(id)}`,
    {
      signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (response.status === 401 && retryAuthentication) {
    temporaryToken = null;
    temporaryTokenExpiresAt = 0;
    return requestRedgifsMedia(id, signal, false);
  }
  if (!response.ok) {
    throw new Error(`Redgifs media lookup failed (${response.status})`);
  }

  const data = await response.json() as RedgifsApiResponse;
  const gif = data.gif;
  const videoUrl = gif?.urls?.sd ?? gif?.urls?.hd ?? gif?.urls?.silent;
  if (!videoUrl) throw new Error("Redgifs media lookup returned no video URL");

  return {
    videoUrl,
    posterUrl: gif?.urls?.poster ?? gif?.urls?.thumbnail,
    width: gif?.width,
    height: gif?.height,
  };
}

export async function getRedgifsMedia(
  id: string,
  signal?: AbortSignal,
): Promise<RedgifsMedia> {
  return requestRedgifsMedia(id, signal);
}
