import * as Sentry from "@sentry/react-native";
import { mux } from "react-native-video-trim";

function normalizeForNative(uri: string): string {
  return uri.startsWith("file://") ? uri.replace("file://", "") : uri;
}

function normalizeOutputUri(outputPath: string): string {
  if (outputPath.startsWith("file://")) return outputPath;
  if (outputPath.startsWith("/")) return `file://${outputPath}`;
  return outputPath;
}

export async function muxAudioVideo(
  videoUri: string,
  audioUri: string,
  outputExt: string = "mp4",
): Promise<string> {
  const result = await mux(
    normalizeForNative(videoUri),
    normalizeForNative(audioUri),
    outputExt,
  );

  if (!result?.success || !result.outputPath) {
    Sentry.captureMessage("Native mux returned invalid result", {
      level: "warning",
      tags: { feature: "share-intent" },
      extra: { videoUri, audioUri, result },
    });
    throw new Error(result?.message || "Native mux failed");
  }

  return normalizeOutputUri(result.outputPath);
}
