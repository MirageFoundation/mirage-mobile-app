/**
 * Video Processing Utilities
 * 
 * Uses react-native-video-trim for video trimming and processing.
 */

import { trim, isValidFile } from 'react-native-video-trim';

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

  // Validate the file first
  try {
    const validationResult = await isValidFile(inputUri);
    const isValid = typeof validationResult === 'boolean' ? validationResult : Boolean(validationResult);
    if (!isValid) {
      console.error("[VideoProcessing] Invalid video file");
      return { uri: inputUri, wasProcessed: false };
    }
  } catch (e) {
    console.warn("[VideoProcessing] Could not validate file:", e);
  }

  try {
    const startTime = options.trimStartMs ?? 0;
    const endTime = options.trimEndMs ?? options.totalDurationMs ?? 0;

    const inputExtension = inputUri.split('.').pop()?.toLowerCase() || 'mp4';
    const outputExt = ['mov', 'mp4', 'm4v'].includes(inputExtension) ? inputExtension : 'mp4';

    const cleanUri = inputUri.startsWith('file://') ? inputUri.replace('file://', '') : inputUri;

    console.log("[VideoProcessing] Trimming from", startTime, "to", endTime, "outputExt:", outputExt);

    const result = await trim(cleanUri, {
      startTime,
      endTime,
      outputExt,
    });
    
    console.log("[VideoProcessing] Success! Output:", result);
    
    // The result is the output file path
    const outputUri = typeof result === 'string' ? result : (result as any).outputPath;
    
    return { 
      uri: outputUri || inputUri, 
      wasProcessed: true 
    };
  } catch (error) {
    console.warn("[VideoProcessing] Trim failed, using original file:", error);
    return { uri: inputUri, wasProcessed: false };
  }
}

/**
 * Trim a video
 * 
 * @param inputUri - Local file URI of the input video
 * @param trimStartMs - Start time in milliseconds
 * @param trimEndMs - End time in milliseconds
 * @param totalDurationMs - Total video duration in milliseconds
 * @param removeAudio - Whether to remove audio (note: may not be supported)
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

/**
 * Check if a file is a valid video
 */
export async function validateVideoFile(uri: string): Promise<boolean> {
  try {
    const result = await isValidFile(uri);
    return typeof result === 'boolean' ? result : Boolean(result);
  } catch {
    return false;
  }
}
