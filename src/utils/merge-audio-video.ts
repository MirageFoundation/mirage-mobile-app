import * as Sentry from "@sentry/react-native";
import { createFile, MP4BoxBuffer, type ISOFile, type Sample, type Movie } from "mp4box";

export async function mergeAudioVideo(
  videoBuffer: ArrayBuffer,
  audioBuffer: ArrayBuffer
): Promise<ArrayBuffer> {
  const extractSamples = (buffer: ArrayBuffer, trackType: "video" | "audio"): Promise<{ samples: Sample[]; info: Movie; stsdEntries: any[] }> => {
    return new Promise((resolve, reject) => {
      const file = createFile() as ISOFile;
      let collectedSamples: Sample[] = [];
      let fileInfo: Movie;

      file.onReady = (info) => {
        fileInfo = info;
        const track = trackType === "video"
          ? info.tracks.find((t) => t.video)
          : info.tracks.find((t) => t.audio);
        if (!track) {
          reject(new Error(`No ${trackType} track`));
          return;
        }
        file.setExtractionOptions(track.id, null, { nbSamples: track.nb_samples });
        file.start();
      };

      file.onSamples = (_id, _user, samples) => {
        collectedSamples = collectedSamples.concat(samples);
      };

      file.onError = (_, msg) => reject(new Error(msg));

      const buf = MP4BoxBuffer.fromArrayBuffer(buffer, 0);
      file.appendBuffer(buf);
      file.flush();

      setTimeout(() => {
        const trak = (file as any).moov?.traks?.find((t: any) =>
          trackType === "video" ? t.mdia?.minf?.vmhd : t.mdia?.minf?.smhd
        );
        const stsdEntries = trak?.mdia?.minf?.stbl?.stsd?.entries ?? [];
        resolve({ samples: collectedSamples, info: fileInfo!, stsdEntries });
      }, 50);
    });
  };

  const [videoParsed, audioParsed] = await Promise.all([
    extractSamples(videoBuffer, "video"),
    extractSamples(audioBuffer, "audio"),
  ]);

  const vTrack = videoParsed.info.tracks.find((t) => t.video)!;
  const aTrack = audioParsed.info.tracks.find((t) => t.audio)!;

  Sentry.addBreadcrumb({
    category: "merge-av",
    message: "Merging audio+video",
    data: {
      videoCodec: vTrack.codec,
      videoSamples: videoParsed.samples.length,
      audioCodec: aTrack.codec,
      audioSamples: audioParsed.samples.length,
      videoStsd: videoParsed.stsdEntries.length,
      audioStsd: audioParsed.stsdEntries.length,
    },
    level: "info",
  });

  const outputFile = createFile() as ISOFile;
  outputFile.init({
    timescale: 600,
    duration: 0,
    brands: ["isom", "iso2", "avc1", "mp41"],
  });

  const videoTrackId = outputFile.addTrack({
    timescale: vTrack.timescale,
    duration: vTrack.duration,
    width: vTrack.video?.width ?? 0,
    height: vTrack.video?.height ?? 0,
    hdlr: "vide",
    type: ((vTrack as any).codec?.split(".")[0] || "avc1") as any,
  });

  const audioTrackId = outputFile.addTrack({
    timescale: aTrack.timescale,
    duration: aTrack.duration,
    channel_count: aTrack.audio?.channel_count || 2,
    samplerate: aTrack.audio?.sample_rate || 44100,
    samplesize: aTrack.audio?.sample_size || 16,
    hdlr: "soun",
    type: ((aTrack as any).codec?.split(".")[0] || "mp4a") as any,
  });

  const outVideoTrak = (outputFile as any).moov?.traks?.find((t: any) => t.mdia?.minf?.vmhd);
  const outAudioTrak = (outputFile as any).moov?.traks?.find((t: any) => t.mdia?.minf?.smhd);

  if (outVideoTrak && videoParsed.stsdEntries.length > 0) {
    outVideoTrak.mdia.minf.stbl.stsd.entries = videoParsed.stsdEntries;
  }
  if (outAudioTrak && audioParsed.stsdEntries.length > 0) {
    outAudioTrak.mdia.minf.stbl.stsd.entries = audioParsed.stsdEntries;
  }

  for (const sample of videoParsed.samples) {
    outputFile.addSample(videoTrackId, new Uint8Array((sample as any).data) as Uint8Array<ArrayBuffer>, {
      duration: sample.duration,
      dts: sample.dts,
      cts: sample.cts,
      is_sync: sample.is_sync,
    });
  }

  for (const sample of audioParsed.samples) {
    outputFile.addSample(audioTrackId, new Uint8Array((sample as any).data) as Uint8Array<ArrayBuffer>, {
      duration: sample.duration,
      dts: sample.dts,
      cts: sample.cts,
      is_sync: sample.is_sync,
    });
  }

  const ds = outputFile.getBuffer();

  Sentry.addBreadcrumb({
    category: "merge-av",
    message: "Merge complete",
    data: { outputSize: ds.buffer.byteLength },
    level: "info",
  });

  return ds.buffer as ArrayBuffer;
}
