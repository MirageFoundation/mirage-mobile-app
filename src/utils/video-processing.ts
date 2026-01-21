/**
 * Video Processing Utilities
 * 
 * Uses ffmpeg-kit-react-native to process videos before upload.
 */

import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';

export interface ProcessVideoOptions {
  /** Remove audio track from video */
  removeAudio?: boolean;
  /** Trim start time in milliseconds */
  trimStartMs?: number;
  /** Trim end time in milliseconds */
  trimEndMs?: number;
  /** Total video duration in milliseconds (needed to detect if trimming is required) */
  totalDurationMs?: number;
}

export interface ProcessVideoResult {
  /** Path to the processed video file */
  uri: string;
  /** Whether the video was modified */
  wasProcessed: boolean;
}

/**
 * Convert milliseconds to FFmpeg time format (HH:MM:SS.mmm)
 */
function msToFFmpegTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
}

/**
 * Check if trimming is needed based on the options
 */
function needsTrimming(options: ProcessVideoOptions): boolean {
  const { trimStartMs, trimEndMs, totalDurationMs } = options;
  
  // No trim values provided
  if (trimStartMs === undefined || trimEndMs === undefined) {
    return false;
  }
  
  // If we have total duration, check if trim covers the whole video
  if (totalDurationMs !== undefined) {
    const isFullVideo = trimStartMs <= 100 && trimEndMs >= (totalDurationMs - 100);
    return !isFullVideo;
  }
  
  // If no total duration, assume trimming if start > 0
  return trimStartMs > 100;
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
  const shouldTrim = needsTrimming(options);
  const shouldRemoveAudio = options.removeAudio === true;
  
  // If no processing needed, return original
  if (!shouldRemoveAudio && !shouldTrim) {
    console.log("[VideoProcessing] No processing needed, returning original");
    return { uri: inputUri, wasProcessed: false };
  }

  console.log("[VideoProcessing] Starting video processing...");
  console.log("[VideoProcessing] Input:", inputUri);
  console.log("[VideoProcessing] Options:", options);
  console.log("[VideoProcessing] Will trim:", shouldTrim);
  console.log("[VideoProcessing] Will remove audio:", shouldRemoveAudio);

  // Generate output path in same directory as input
  const timestamp = Date.now();
  const inputPath = inputUri.replace('file://', '');
  const inputDir = inputPath.substring(0, inputPath.lastIndexOf('/'));
  const outputPath = `${inputDir}/processed_${timestamp}.mp4`;
  const outputUri = `file://${outputPath}`;

  try {
    // Build ffmpeg command
    let command = `-i "${inputPath}"`;
    
    // Add trim options if needed
    if (shouldTrim && options.trimStartMs !== undefined && options.trimEndMs !== undefined) {
      const startTime = msToFFmpegTime(options.trimStartMs);
      const duration = (options.trimEndMs - options.trimStartMs) / 1000;
      
      // -ss: seek to start time (placed before -i for faster seeking, but we put after for accuracy)
      // -t: duration to capture
      command = `-ss ${startTime} -i "${inputPath}" -t ${duration.toFixed(3)}`;
      
      console.log("[VideoProcessing] Trim: start=", startTime, "duration=", duration);
    }
    
    // Add audio removal if needed
    if (shouldRemoveAudio) {
      command += " -an";
    } else {
      command += " -c:a copy";
    }
    
    // Video codec - use copy if not trimming for speed, otherwise re-encode for accuracy
    if (shouldTrim) {
      // Re-encode for frame-accurate trimming
      // Using libx264 with fast preset for reasonable speed/quality
      command += " -c:v libx264 -preset ultrafast -crf 23";
    } else {
      // Just copy the video stream (fast)
      command += " -c:v copy";
    }
    
    // Output file
    command += ` -y "${outputPath}"`;
    
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

/**
 * Trim and optionally mute a video
 * 
 * @param inputUri - Local file URI of the input video
 * @param trimStartMs - Start time in milliseconds
 * @param trimEndMs - End time in milliseconds
 * @param totalDurationMs - Total video duration in milliseconds
 * @param removeAudio - Whether to remove audio
 * @returns URI of the processed video
 */
export async function trimVideo(
  inputUri: string,
  trimStartMs: number,
  trimEndMs: number,
  totalDurationMs: number,
  removeAudio: boolean = false
): Promise<string> {
  const result = await processVideo(inputUri, {
    trimStartMs,
    trimEndMs,
    totalDurationMs,
    removeAudio,
  });
  return result.uri;
}
