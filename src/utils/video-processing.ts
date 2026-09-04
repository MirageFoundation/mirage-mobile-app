/**
 * Video Processing Utilities
 * 
 * Uses react-native-video-trim for video trimming and processing.
 */

import * as Sentry from '@sentry/react-native';
import { Video } from 'react-native-compressor';
import { trim, isValidFile } from 'react-native-video-trim';
import { sanitizedTelemetryError } from '@/src/services/react-query-telemetry';
import { getUploadVideoCompressionSettings } from '@/src/utils/video-upload-quality';

const MIN_VIDEO_SIZE_TO_COMPRESS_MB = 2;

export interface ProcessVideoOptions {
  /** Remove audio track from video */
  removeAudio?: boolean;
  /** Compress video for faster upload and stream provider processing */
  compressForUpload?: boolean;
  /** Throw instead of falling back to the original/current file when compression fails */
  failOnCompressionError?: boolean;
  /** Trim start time in milliseconds */
  trimStartMs?: number;
  /** Trim end time in milliseconds */
  trimEndMs?: number;
  /** Total video duration in milliseconds (needed to detect if trimming is required) */
  totalDurationMs?: number;
  /** Source video width in pixels */
  sourceWidth?: number;
  /** Source video height in pixels */
  sourceHeight?: number;
  /** Reports preprocessing progress from 0 to 100. */
  onProgress?: (progress: number) => void;
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

async function compressVideoForUpload(
  inputUri: string,
  options: ProcessVideoOptions,
): Promise<ProcessVideoResult> {
  const compressionStartedAt = Date.now();
  const { maxSize, bitrate } = getUploadVideoCompressionSettings(options);
  console.log("[VideoProcessing] Compressing video for upload...");
  Sentry.addBreadcrumb({
    category: 'video-processing',
    message: 'Starting video compression',
    level: 'info',
    data: {
      maxSize,
      bitrate,
      stripAudio: options.removeAudio === true,
      totalDurationMs: options.totalDurationMs,
      sourceWidth: options.sourceWidth,
      sourceHeight: options.sourceHeight,
    },
  });

  const outputUri = await Video.compress(
    inputUri,
    {
      compressionMethod: 'manual',
      maxSize,
      bitrate,
      minimumFileSizeForCompress: MIN_VIDEO_SIZE_TO_COMPRESS_MB,
      stripAudio: options.removeAudio === true,
    },
    (progress) => {
      options.onProgress?.(Math.round(progress * 100));
      if (progress === 0 || progress === 1 || Math.round(progress * 100) % 25 === 0) {
        console.log("[VideoProcessing] Compression progress:", Math.round(progress * 100));
      }
    },
  );

  const compressionDurationMs = Date.now() - compressionStartedAt;

  console.log("[VideoTiming] compression complete", {
    durationMs: compressionDurationMs,
    wasCompressed: !!outputUri && outputUri !== inputUri,
  });
  Sentry.addBreadcrumb({
    category: 'video-processing',
    message: 'Video compression complete',
    level: 'info',
    data: {
      durationMs: compressionDurationMs,
      wasCompressed: !!outputUri && outputUri !== inputUri,
      maxSize,
      bitrate,
    },
  });
  if (compressionDurationMs > 15000) {
    Sentry.captureMessage('Video compression was slow', {
      level: 'warning',
      tags: {
        feature: 'video-posting',
        operation: 'video-compression',
      },
      extra: {
        durationMs: compressionDurationMs,
        maxSize,
        bitrate,
      },
    });
  }

  return {
    uri: outputUri || inputUri,
    wasProcessed: !!outputUri && outputUri !== inputUri,
  };
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
  const processingStartedAt = Date.now();
  const shouldTrim = needsTrimming(options);
  const shouldRemoveAudio = options.removeAudio === true;
  const shouldCompress = options.compressForUpload !== false;
  options.onProgress?.(0);

  console.log("[VideoProcessing] Starting video processing...");
  console.log("[VideoProcessing] Options:", options);
  console.log("[VideoProcessing] Will trim:", shouldTrim);
  console.log("[VideoProcessing] Will compress:", shouldCompress);
  console.log("[VideoProcessing] Will remove audio:", shouldRemoveAudio);
  Sentry.addBreadcrumb({
    category: 'video-processing',
    message: 'Starting video processing',
    level: 'info',
    data: {
      shouldTrim,
      shouldCompress,
      shouldRemoveAudio,
      trimStartMs: options.trimStartMs,
      trimEndMs: options.trimEndMs,
      totalDurationMs: options.totalDurationMs,
      sourceWidth: options.sourceWidth,
      sourceHeight: options.sourceHeight,
    },
  });

  // Validate the file first
  const validationStartedAt = Date.now();
  try {
    const validationResult = await isValidFile(inputUri);
    options.onProgress?.(10);
    console.log("[VideoTiming] validation complete", {
      durationMs: Date.now() - validationStartedAt,
    });
    const isValid = typeof validationResult === 'boolean' ? validationResult : Boolean(validationResult);
    if (!isValid) {
      console.error("[VideoProcessing] Invalid video file");
      Sentry.addBreadcrumb({
        category: 'video-processing',
        message: 'Invalid video file detected',
        level: 'warning',
      });
      return { uri: inputUri, wasProcessed: false };
    }
  } catch {
    options.onProgress?.(10);
    console.log("[VideoTiming] validation failed", {
      durationMs: Date.now() - validationStartedAt,
    });
    console.warn("[VideoProcessing] Could not validate file");
    Sentry.addBreadcrumb({
      category: 'video-processing',
      message: 'Video validation failed',
      level: 'warning',
    });
  }

  let currentUri = inputUri;
  let wasProcessed = false;

  if (shouldTrim) {
    try {
      const trimStartedAt = Date.now();
      const startTime = options.trimStartMs ?? 0;
      const endTime = options.trimEndMs ?? options.totalDurationMs ?? 0;

      const outputExt = 'mp4';

      const cleanUri = inputUri.startsWith('file://') ? inputUri.replace('file://', '') : inputUri;

      console.log("[VideoProcessing] Trimming from", startTime, "to", endTime, "outputExt:", outputExt);

      const result = await trim(cleanUri, {
        startTime,
        endTime,
        outputExt,
      });
      
      console.log("[VideoProcessing] Trim succeeded");
      console.log("[VideoTiming] trim complete", {
        durationMs: Date.now() - trimStartedAt,
        startTime,
        endTime,
      });
      
      const outputUri = typeof result === 'string' ? result : (result as any).outputPath;
      if (outputUri) {
        currentUri = outputUri;
        wasProcessed = true;
      }
      options.onProgress?.(25);
    } catch {
      options.onProgress?.(25);
      console.warn("[VideoProcessing] Trim failed, using original file");
      Sentry.captureException(sanitizedTelemetryError('media-upload', {
        error_class: 'unexpected',
      }), {
        tags: {
          feature: 'video-processing',
          stage: 'trim',
        },
        extra: {
          trimStartMs: options.trimStartMs,
          trimEndMs: options.trimEndMs,
          totalDurationMs: options.totalDurationMs,
          removeAudio: shouldRemoveAudio,
        },
      });
    }
  }

  if (!shouldCompress) {
    options.onProgress?.(100);
    const totalDurationMs = Date.now() - processingStartedAt;
    console.log("[VideoTiming] processing complete", {
      totalDurationMs,
      wasProcessed,
      skippedCompression: true,
    });
    Sentry.addBreadcrumb({
      category: 'video-processing',
      message: 'Video processing complete',
      level: 'info',
      data: {
        totalDurationMs,
        wasProcessed,
        skippedCompression: true,
      },
    });
    return { uri: currentUri, wasProcessed };
  }

  try {
    const compressed = await compressVideoForUpload(currentUri, options);
    options.onProgress?.(100);
    const totalDurationMs = Date.now() - processingStartedAt;
    console.log("[VideoTiming] processing complete", {
      totalDurationMs,
      wasProcessed: wasProcessed || compressed.wasProcessed,
      skippedCompression: false,
    });
    Sentry.addBreadcrumb({
      category: 'video-processing',
      message: 'Video processing complete',
      level: 'info',
      data: {
        totalDurationMs,
        wasProcessed: wasProcessed || compressed.wasProcessed,
        skippedCompression: false,
      },
    });
    return {
      uri: compressed.uri,
      wasProcessed: wasProcessed || compressed.wasProcessed,
    };
  } catch (error) {
    console.warn("[VideoProcessing] Compression failed");
    if (options.failOnCompressionError) {
      throw error;
    }
    Sentry.captureException(sanitizedTelemetryError('media-upload', {
      error_class: 'unexpected',
    }), {
      tags: {
        feature: 'video-processing',
        stage: 'compress',
      },
      extra: getUploadVideoCompressionSettings(options),
    });
    const totalDurationMs = Date.now() - processingStartedAt;
    console.log("[VideoTiming] processing complete", {
      totalDurationMs,
      wasProcessed,
      compressionFailed: true,
    });
    Sentry.addBreadcrumb({
      category: 'video-processing',
      message: 'Video processing completed after compression failure',
      level: 'warning',
      data: {
        totalDurationMs,
        wasProcessed,
      },
    });
    return { uri: currentUri, wasProcessed };
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

export const MAX_VIDEO_DURATION_MS = 30 * 60 * 1000;

export async function trimToMaxDuration(
  uri: string,
  durationMs: number,
): Promise<string> {
  if (durationMs <= MAX_VIDEO_DURATION_MS) return uri;
  console.log("[VideoProcessing] Auto-trimming to 30m, original duration:", durationMs);
  Sentry.addBreadcrumb({
    category: 'video-processing',
    message: 'Auto-trimming video to max duration',
    level: 'info',
    data: {
      durationMs,
      maxDurationMs: MAX_VIDEO_DURATION_MS,
    },
  });
  const result = await processVideo(uri, {
    trimStartMs: 0,
    trimEndMs: MAX_VIDEO_DURATION_MS,
    totalDurationMs: durationMs,
  });
  return result.uri;
}
