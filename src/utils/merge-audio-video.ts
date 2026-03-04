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

  console.log("[mergeAV] Video:", vTrack.codec, vTrack.video?.width, "x", vTrack.video?.height, "samples:", videoParsed.samples.length, "stsd:", videoParsed.stsdEntries.length);
  console.log("[mergeAV] Audio:", aTrack.codec, "rate:", aTrack.audio?.sample_rate, "ch:", aTrack.audio?.channel_count, "samples:", audioParsed.samples.length, "stsd:", audioParsed.stsdEntries.length);

  if (videoParsed.stsdEntries.length > 0) {
    const entry = videoParsed.stsdEntries[0];
    console.log("[mergeAV] Video stsd[0] type:", entry.type, "has avcC:", !!entry.avcC, "has hvcC:", !!entry.hvcC, "boxes:", entry.boxes?.length);
  }

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
    console.log("[mergeAV] Replaced video stsd entries with source entries");
  }
  if (outAudioTrak && audioParsed.stsdEntries.length > 0) {
    outAudioTrak.mdia.minf.stbl.stsd.entries = audioParsed.stsdEntries;
    console.log("[mergeAV] Replaced audio stsd entries with source entries");
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

  console.log("[mergeAV] Wrote", videoParsed.samples.length, "video +", audioParsed.samples.length, "audio samples");

  const finalVideoStsd = outVideoTrak?.mdia?.minf?.stbl?.stsd;
  console.log("[mergeAV] Final video stsd entries:", finalVideoStsd?.entries?.length, "type:", finalVideoStsd?.entries?.[0]?.type, "has avcC:", !!finalVideoStsd?.entries?.[0]?.avcC);

  const ds = outputFile.getBuffer();
  console.log("[mergeAV] Output buffer size:", ds.buffer.byteLength);
  return ds.buffer as ArrayBuffer;
}
