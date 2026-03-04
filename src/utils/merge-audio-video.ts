import { createFile, MP4BoxBuffer, type ISOFile, type Sample, type Movie } from "mp4box";

export async function mergeAudioVideo(
  videoBuffer: ArrayBuffer,
  audioBuffer: ArrayBuffer
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const videoFile = createFile() as ISOFile;
    const audioFile = createFile() as ISOFile;
    let videoInfo: Movie | null = null;
    let audioInfo: Movie | null = null;
    let videoSamples: Sample[] = [];
    let audioSamples: Sample[] = [];

    videoFile.onReady = (info) => {
      videoInfo = info;
      const videoTrack = info.tracks.find((t) => t.video);
      if (!videoTrack) {
        reject(new Error("No video track found"));
        return;
      }
      videoFile.setExtractionOptions(videoTrack.id, null, { nbSamples: videoTrack.nb_samples });
      videoFile.start();
    };

    videoFile.onSamples = (_id, _user, samples) => {
      videoSamples = videoSamples.concat(samples);
    };

    audioFile.onReady = (info) => {
      audioInfo = info;
      const audioTrack = info.tracks.find((t) => t.audio);
      if (!audioTrack) {
        reject(new Error("No audio track found"));
        return;
      }
      audioFile.setExtractionOptions(audioTrack.id, null, { nbSamples: audioTrack.nb_samples });
      audioFile.start();
    };

    audioFile.onSamples = (_id, _user, samples) => {
      audioSamples = audioSamples.concat(samples);
    };

    videoFile.onError = (_, msg) => reject(new Error("Video parse error: " + msg));
    audioFile.onError = (_, msg) => reject(new Error("Audio parse error: " + msg));

    try {
      const vBuf = MP4BoxBuffer.fromArrayBuffer(videoBuffer, 0);
      videoFile.appendBuffer(vBuf);
      videoFile.flush();

      const aBuf = MP4BoxBuffer.fromArrayBuffer(audioBuffer, 0);
      audioFile.appendBuffer(aBuf);
      audioFile.flush();
    } catch (e) {
      reject(e);
      return;
    }

    if (!videoInfo || !audioInfo) {
      reject(new Error("Failed to parse video or audio"));
      return;
    }

    const vTrack = (videoInfo as Movie).tracks.find((t) => t.video);
    const aTrack = (audioInfo as Movie).tracks.find((t) => t.audio);
    if (!vTrack || !aTrack) {
      reject(new Error("Missing video or audio track info"));
      return;
    }

    const outputFile = createFile() as ISOFile;
    outputFile.init({
      timescale: vTrack.timescale,
      duration: vTrack.duration,
      brands: ["isom", "iso2", "avc1", "mp41"],
    });

    const vDesc = vTrack.video
      ? {
          width: vTrack.video.width,
          height: vTrack.video.height,
        }
      : {};

    const videoTrackId = outputFile.addTrack({
      timescale: vTrack.timescale,
      duration: vTrack.duration,
      type: ((vTrack as any).codec?.split(".")[0] || "avc1") as any,
      ...vDesc,
      avcDecoderConfigRecord: videoSamples.length > 0 ? (videoSamples[0] as any).description?.avcC?.data : undefined,
      description_boxes: (vTrack as any).mdia?.minf?.stbl?.stsd?.entries?.map((e: any) => e) ?? [],
    });

    const audioTrackId = outputFile.addTrack({
      timescale: aTrack.timescale,
      duration: aTrack.duration,
      type: ((aTrack as any).codec?.split(".")[0] || "mp4a") as any,
      channel_count: aTrack.audio?.channel_count || 2,
      samplerate: aTrack.audio?.sample_rate || 44100,
      samplesize: aTrack.audio?.sample_size || 16,
      hdlr: "soun",
      description_boxes: (aTrack as any).mdia?.minf?.stbl?.stsd?.entries?.map((e: any) => e) ?? [],
    });

    for (const sample of videoSamples) {
      outputFile.addSample(videoTrackId, new Uint8Array((sample as any).data) as Uint8Array<ArrayBuffer>, {
        duration: sample.duration,
        dts: sample.dts,
        cts: sample.cts,
        is_sync: sample.is_sync,
      });
    }

    for (const sample of audioSamples) {
      outputFile.addSample(audioTrackId, new Uint8Array((sample as any).data) as Uint8Array<ArrayBuffer>, {
        duration: sample.duration,
        dts: sample.dts,
        cts: sample.cts,
        is_sync: sample.is_sync,
      });
    }

    try {
      const ds = outputFile.getBuffer();
      resolve(ds.buffer as ArrayBuffer);
    } catch (e) {
      reject(e);
    }
  });
}
