/**
 * Video Processing Utilities
 * 
 * Uses ffmpeg-kit-react-native to process videos before upload.
 */

import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';

export interface ProcessVideoOptions {
  /** Remove audio track from video */
  removeAudio?: boolean;
}

export interface ProcessVideoResult {
  /** Path to the processed video file */
  uri: string;
  /** Whether the video was modified */
  wasProcessed: boolean;
}

/**
 * Process a video file with the given options
 * 
 * @param inputUri - Local file URI of the input video
 * @param options - Processing options
 * @returns Processed video URI
 */
export async function processVideo(
  inputUri: string,
  options: ProcessVideoOptions
): Promise<ProcessVideoResult> {
  // If no processing needed, return original
  if (!options.removeAudio) {
    return { uri: inputUri, wasProcessed: false };
  }

  console.log("[VideoProcessing] Starting video processing...");
  console.log("[VideoProcessing] Input:", inputUri);
  console.log("[VideoProcessing] Options:", options);

  // Generate output path in same directory as input
  const timestamp = Date.now();
  const inputPath = inputUri.replace('file://', '');
  const inputDir = inputPath.substring(0, inputPath.lastIndexOf('/'));
  const outputPath = `${inputDir}/processed_${timestamp}.mp4`;
  const outputUri = `file://${outputPath}`;

  try {
    // Build ffmpeg command to remove audio
    // -i: input file
    // -an: remove audio
    // -c:v copy: copy video codec (no re-encoding, fast)
    // -y: overwrite output file
    const command = `-i "${inputPath}" -an -c:v copy -y "${outputPath}"`;
    
    console.log("[VideoProcessing] Running ffmpeg command:", command);

    const session = await FFmpegKit.execute(command);
    const returnCode = await session.getReturnCode();

    if (ReturnCode.isSuccess(returnCode)) {
      console.log("[VideoProcessing] Success! Output:", outputUri);
      return { uri: outputUri, wasProcessed: true };
    } else if (ReturnCode.isCancel(returnCode)) {
      console.log("[VideoProcessing] Cancelled");
      throw new Error("Video processing was cancelled");
    } else {
      const logs = await session.getAllLogsAsString();
      console.error("[VideoProcessing] Failed:", logs);
      throw new Error("Failed to process video");
    }
  } catch (error) {
    console.error("[VideoProcessing] Error:", error);
    // Return original file if processing fails
    console.log("[VideoProcessing] Falling back to original file");
    return { uri: inputUri, wasProcessed: false };
  }
}

/**
 * Remove audio from a video file
 * 
 * @param inputUri - Local file URI of the input video
 * @returns URI of the video without audio
 */
export async function removeAudioFromVideo(inputUri: string): Promise<string> {
  const result = await processVideo(inputUri, { removeAudio: true });
  return result.uri;
}
