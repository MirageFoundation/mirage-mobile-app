import { createVideoPlayer } from "expo-video";

const MEDIA_DURATION_TIMEOUT_MS = 10_000;

export async function getMediaDurationMillis(uri: string): Promise<number | null> {
  const player = createVideoPlayer({ uri });

  try {
    if (player.status === "readyToPlay" && player.duration > 0) {
      return player.duration * 1000;
    }

    return await new Promise<number | null>((resolve) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      let sourceSubscription: { remove: () => void } | null = null;
      let statusSubscription: { remove: () => void } | null = null;
      const finish = (duration: number | null) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        sourceSubscription?.remove();
        statusSubscription?.remove();
        resolve(duration);
      };
      sourceSubscription = player.addListener("sourceLoad", ({ duration }) => {
        finish(duration > 0 ? duration * 1000 : null);
      });
      statusSubscription = player.addListener("statusChange", ({ status }) => {
        if (status === "readyToPlay") {
          finish(player.duration > 0 ? player.duration * 1000 : null);
        } else if (status === "error") {
          finish(null);
        }
      });
      timeout = setTimeout(() => finish(null), MEDIA_DURATION_TIMEOUT_MS);
    });
  } finally {
    player.release();
  }
}
