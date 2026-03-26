import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback, useEffect, useRef } from "react";

import * as Sentry from "@sentry/react-native";
import { File as ExpoFile, Paths } from "expo-file-system";
import { useFocusEffect } from "@react-navigation/native";
import { createVideoPlayer } from "expo-video";

import { fetchLinkMeta } from "@/src/utils/fetch-link-meta";
import { mergeAudioVideo } from "@/src/utils/merge-audio-video";
import { sanitizeTopicName } from "@/src/utils/topic-validation";
import { trimToMaxDuration } from "@/src/utils/video-processing";
import { useDraftStore, type Community } from "@/src/stores/draft-store";
import type { ContentTag } from "@/src/api/write/endpoints/posts";

type ShareIntentFile = {
  path: string;
  mimeType?: string;
};

type ShareIntentPayload = {
  type?: string;
  webUrl?: string;
  text?: string;
  files?: ShareIntentFile[];
};

export type VideoMeta = {
  originalUri: string;
  width: number;
  height: number;
  trimStart: number;
  trimEnd: number;
};

export const VIDEO_META = new Map<string, VideoMeta>();
let handledVideoParam: string | null = null;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

type UseCreateIntakeParams = {
  isEditMode: boolean;
  params: {
    videoUri?: string;
    originalVideoUri?: string;
    replacingUri?: string;
    videoWidth?: string;
    videoHeight?: string;
    trimStart?: string;
    trimEnd?: string;
    isMuted?: string;
    editTopic?: string;
    editTitle?: string;
    editBody?: string;
    editTag?: string;
    editMedia?: string;
  };
  draft: { attachmentType: string | null; linkUrl: string | null; mediaUris: string[] };
  maxContentLength: number;
  maxTitleLength: number;
  hasShareIntent: boolean;
  shareIntent: ShareIntentPayload | null;
  resetShareIntent: () => void;
  clearDraft: () => void;
  updateDraft: (partial: any) => void;
  setAttachment: (type: any, uri?: string) => void;
  removeAttachment: () => void;
  setShowLinkInput: Dispatch<SetStateAction<boolean>>;
  setLinkUrl: Dispatch<SetStateAction<string>>;
  setLinkError: Dispatch<SetStateAction<string | null>>;
  setImageDimensions: Dispatch<SetStateAction<{ width: number; height: number } | null>>;
  setSelectedContentWarning: Dispatch<SetStateAction<ContentTag>>;
  setSelectedStickers: Dispatch<SetStateAction<string[]>>;
  setIsVideoMuted: Dispatch<SetStateAction<boolean>>;
  setIsVideoPlaying: Dispatch<SetStateAction<boolean>>;
  setIsProcessingShareLink: Dispatch<SetStateAction<boolean>>;
  setIsPreparingVideo: Dispatch<SetStateAction<boolean>>;
  clearVideoUploads: () => void;
  removeVideoUpload: (uri: string) => void;
  startVideoUpload: (uri: string, silent?: boolean) => void;
  navigatedToEditorRef: MutableRefObject<boolean>;
};

export function useCreateIntake({
  isEditMode,
  params,
  draft,
  maxContentLength,
  maxTitleLength,
  hasShareIntent,
  shareIntent,
  resetShareIntent,
  clearDraft,
  updateDraft,
  setAttachment,
  removeAttachment,
  setShowLinkInput,
  setLinkUrl,
  setLinkError,
  setImageDimensions,
  setSelectedContentWarning,
  setSelectedStickers,
  setIsVideoMuted,
  setIsVideoPlaying,
  setIsProcessingShareLink,
  setIsPreparingVideo,
  clearVideoUploads,
  removeVideoUpload,
  startVideoUpload,
  navigatedToEditorRef,
}: UseCreateIntakeParams) {
  useFocusEffect(
    useCallback(() => {
      if (navigatedToEditorRef.current) {
        navigatedToEditorRef.current = false;
        setIsPreparingVideo(false);
      }
    }, [navigatedToEditorRef, setIsPreparingVideo]),
  );

  useEffect(() => {
    if (isEditMode) return;
    if (draft.attachmentType === "link" && draft.linkUrl) {
      setShowLinkInput(true);
      setLinkUrl(draft.linkUrl);
    } else if (draft.attachmentType === "link" && !draft.linkUrl) {
      removeAttachment();
    } else if (
      (draft.attachmentType === "image" || draft.attachmentType === "video") &&
      draft.mediaUris.length === 0
    ) {
      removeAttachment();
    }
  }, [
    draft.attachmentType,
    draft.linkUrl,
    draft.mediaUris.length,
    isEditMode,
    removeAttachment,
    setLinkUrl,
    setShowLinkInput,
  ]);

  const editInitializedRef = useRef(false);
  useEffect(() => {
    if (!isEditMode || editInitializedRef.current) return;
    editInitializedRef.current = true;

    const topic = params.editTopic ?? "general";
    const community: Community = {
      id: topic,
      name: topic,
      memberCount: 0,
      isSubscribed: true,
    };
    updateDraft({
      community,
      title: params.editTitle ?? "",
      body: params.editBody ?? "",
    });

    if (params.editTag) {
      setSelectedContentWarning(params.editTag as ContentTag);
    }

    if (params.editMedia) {
      try {
        const mediaUrls = JSON.parse(params.editMedia) as string[];
        if (mediaUrls.length > 0) {
          setSelectedStickers(mediaUrls);
        }
      } catch {}
    }
  }, [
    isEditMode,
    params.editBody,
    params.editMedia,
    params.editTag,
    params.editTitle,
    params.editTopic,
    setSelectedContentWarning,
    setSelectedStickers,
    updateDraft,
  ]);

  const lastProcessedIntentRef = useRef<string | null>(null);
  const shareTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasShareIntent || !shareIntent || isEditMode) return;

    const intentKey =
      shareIntent.webUrl ?? shareIntent.text ?? shareIntent.files?.[0]?.path ?? null;
    if (!intentKey || intentKey === lastProcessedIntentRef.current) return;
    lastProcessedIntentRef.current = intentKey;

    if (shareTimeoutRef.current) {
      clearTimeout(shareTimeoutRef.current);
      shareTimeoutRef.current = null;
    }
    const currentIntentKey = intentKey;

    Sentry.addBreadcrumb({
      category: "share-intent",
      message: "Processing share intent",
      data: {
        type: shareIntent.type,
        webUrl: shareIntent.webUrl,
        hasText: !!shareIntent.text,
        fileCount: shareIntent.files?.length ?? 0,
      },
      level: "info",
    });

    clearDraft();
    setShowLinkInput(false);
    setLinkUrl("");
    setLinkError(null);
    removeAttachment();
    setImageDimensions(null);
    setSelectedContentWarning("");
    setSelectedStickers([]);
    clearVideoUploads();
    VIDEO_META.clear();
    handledVideoParam = null;
    setIsVideoMuted(false);
    setIsVideoPlaying(false);

    const redditMatch = (shareIntent.webUrl ?? shareIntent.text ?? "").match(
      /reddit\.com\/r\/([^/]+)/i,
    );
    if (redditMatch) {
      const topicName = sanitizeTopicName(redditMatch[1]);
      if (topicName.length >= 2) {
        updateDraft({
          community: {
            id: topicName,
            name: topicName,
            memberCount: 0,
            isSubscribed: false,
            isNewTopic: true,
          },
        });
      }
    }

    shareTimeoutRef.current = setTimeout(() => {
      if (lastProcessedIntentRef.current !== currentIntentKey) return;
      if (shareIntent.text && !shareIntent.webUrl) {
        updateDraft({ body: shareIntent.text.slice(0, maxContentLength) });
      }
      if (shareIntent.webUrl) {
        setIsProcessingShareLink(true);
        fetchLinkMeta(shareIntent.webUrl)
          .then(async (meta) => {
            if (lastProcessedIntentRef.current !== currentIntentKey) return;

            let finalTitle: string | undefined;
            let titleOverflow = "";
            if (meta.title) {
              finalTitle = meta.title;
              if (meta.domain === "instagram.com") {
                const igMatch = meta.title.match(/^(.+?)\s+on\s+Instagram/i);
                if (igMatch) {
                  finalTitle = `${igMatch[1]} on Instagram`;
                }
              }
              if (
                (meta.domain === "x.com" || meta.domain === "twitter.com") &&
                /^.+\s+\(@\w+\)$/.test(finalTitle)
              ) {
                finalTitle = undefined;
              }
              if (finalTitle) {
                finalTitle = decodeHtmlEntities(finalTitle);
                if (finalTitle.length > maxTitleLength) {
                  const lines = finalTitle.split("\n");
                  let titlePart = "";
                  let overflowLines: string[] = [];
                  for (let i = 0; i < lines.length; i++) {
                    const candidate = titlePart ? `${titlePart}\n${lines[i]}` : lines[i];
                    if (candidate.length <= maxTitleLength) {
                      titlePart = candidate;
                    } else {
                      overflowLines = lines.slice(i);
                      break;
                    }
                  }
                  if (!titlePart && lines[0]) {
                    titlePart = lines[0].slice(0, maxTitleLength);
                    overflowLines = lines;
                  }
                  finalTitle = titlePart;
                  titleOverflow = overflowLines.join("\n").trim();
                }
                updateDraft({ title: finalTitle.slice(0, maxTitleLength) });
              }
            }
            const bodyParts: string[] = [];
            if (!finalTitle && meta.description) {
              const desc = decodeHtmlEntities(meta.description);
              const lines = desc.split("\n");
              finalTitle = lines[0].slice(0, maxTitleLength);
              updateDraft({ title: finalTitle });
              const remaining = lines.slice(1).join("\n").trim();
              if (remaining) {
                bodyParts.push(remaining.slice(0, maxContentLength));
              }
            } else if (meta.description && meta.description !== meta.title) {
              let desc = meta.description;
              if (meta.domain === "instagram.com" && meta.title) {
                const igCaptionMatch = meta.title.match(/on\s+Instagram:\s*"(.+)"/s);
                if (igCaptionMatch) {
                  desc = igCaptionMatch[1];
                }
              }
              desc = decodeHtmlEntities(desc);
              if (meta.domain === "instagram.com") {
                desc = desc
                  .replace(/\([^)]*\)/g, "")
                  .replace(/\[[^\]]*\]/g, "")
                  .replace(/#\w+/g, "")
                  .replace(/\b[A-Z][a-z]+(?:[A-Z][a-z]*)+\b/g, "")
                  .replace(/[.…][\s.…]*[.…]/g, "")
                  .replace(/\s{2,}/g, " ")
                  .trim();
              }
              bodyParts.push(desc.slice(0, maxContentLength));
            }
            if (titleOverflow) {
              bodyParts.unshift(titleOverflow);
            }
            updateDraft({ body: bodyParts.join("\n\n").slice(0, maxContentLength) });

            if (meta.externalUrl) {
              setShowLinkInput(true);
              setLinkUrl(meta.externalUrl);
              updateDraft({ linkUrl: meta.externalUrl });
            }

            let videoDownloaded = false;
            let mediaCount = 0;

            const videosToDownload = meta.videos?.length
              ? meta.videos.slice(0, 10)
              : meta.video
                ? [meta.video]
                : [];

            for (let vi = 0; vi < videosToDownload.length; vi++) {
              if (mediaCount >= 10) break;
              const vidUrl = videosToDownload[vi];
              try {
                const response = await fetch(vidUrl);
                const contentType = response.headers.get("content-type") ?? "";
                const resolvedUrl = response.url;

                const isVideoContent =
                  contentType.startsWith("video/") ||
                  contentType.startsWith("application/octet-stream") ||
                  contentType === "image/gif";
                const hasVideoExtension = /\.(mp4|mov|webm|m3u8|ts|gif)(\?|#|$)/i.test(
                  resolvedUrl || vidUrl,
                );

                if (response.ok && (isVideoContent || hasVideoExtension)) {
                  const ext = contentType.includes("mp4")
                    ? "mp4"
                    : contentType.includes("webm")
                      ? "webm"
                      : contentType.includes("quicktime")
                        ? "mov"
                        : contentType === "image/gif"
                          ? "gif"
                          : (resolvedUrl || vidUrl).match(/\.(mp4|mov|webm|m3u8|gif)/i)?.[1] ?? "mp4";
                  const destFile = new ExpoFile(
                    Paths.cache,
                    `shared_link_video_${Date.now()}_${vi}.${ext}`,
                  );
                  const arrayBuffer = await response.arrayBuffer();
                  if (arrayBuffer.byteLength > 1000) {
                    let audioMerged = false;
                    if (vi === 0) {
                      const audioUrlsToTry = meta.audioUrls?.length
                        ? meta.audioUrls
                        : meta.audioUrl
                          ? [meta.audioUrl]
                          : [];
                      if (audioUrlsToTry.length > 0) {
                        for (const tryAudioUrl of audioUrlsToTry) {
                          if (audioMerged) break;
                          try {
                            const audioRes = await fetch(tryAudioUrl, {
                              headers: {
                                "User-Agent":
                                  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
                                Referer: "https://www.reddit.com/",
                                Accept: "*/*",
                              },
                            });
                            if (!audioRes.ok) continue;
                            const audioBuffer = await audioRes.arrayBuffer();
                            if (audioBuffer.byteLength < 500) continue;
                            const audioContentType = audioRes.headers.get("content-type") ?? "";
                            if (
                              audioContentType.includes("text/html") ||
                              audioContentType.includes("text/xml")
                            ) {
                              continue;
                            }
                            const mergedBuffer = await mergeAudioVideo(
                              arrayBuffer,
                              audioBuffer,
                            );
                            const mergedFile = new ExpoFile(
                              Paths.cache,
                              `shared_link_merged_${Date.now()}_${vi}.mp4`,
                            );
                            mergedFile.write(new Uint8Array(mergedBuffer));
                            let finalUri = mergedFile.uri;
                            try {
                              const tempPlayer = createVideoPlayer({ uri: mergedFile.uri });
                              await new Promise<void>((resolve) => {
                                const sub = tempPlayer.addListener(
                                  "statusChange",
                                  ({ status }) => {
                                    if (status === "readyToPlay" || status === "error") {
                                      sub.remove();
                                      resolve();
                                    }
                                  },
                                );
                                setTimeout(() => {
                                  sub.remove();
                                  resolve();
                                }, 5000);
                              });
                              const durationMs = Math.round(tempPlayer.duration * 1000);
                              tempPlayer.release();
                              if (durationMs > 59000) {
                                finalUri = await trimToMaxDuration(mergedFile.uri, durationMs);
                              }
                            } catch {}
                            setAttachment("video", finalUri);
                            startVideoUpload(finalUri);
                            videoDownloaded = true;
                            mediaCount++;
                            audioMerged = true;
                            break;
                          } catch (mergeErr) {
                            Sentry.addBreadcrumb({
                              category: "share-intent",
                              message: "Audio merge attempt failed",
                              data: { error: String(mergeErr) },
                              level: "warning",
                            });
                          }
                        }
                      }
                    }
                    if (!audioMerged) {
                      destFile.write(new Uint8Array(arrayBuffer));
                      let finalUri = destFile.uri;
                      try {
                        const tempPlayer = createVideoPlayer({ uri: destFile.uri });
                        await new Promise<void>((resolve) => {
                          const sub = tempPlayer.addListener("statusChange", ({ status }) => {
                            if (status === "readyToPlay" || status === "error") {
                              sub.remove();
                              resolve();
                            }
                          });
                          setTimeout(() => {
                            sub.remove();
                            resolve();
                          }, 5000);
                        });
                        const durationMs = Math.round(tempPlayer.duration * 1000);
                        tempPlayer.release();
                        if (durationMs > 59000) {
                          finalUri = await trimToMaxDuration(destFile.uri, durationMs);
                        }
                      } catch {}
                      setAttachment("video", finalUri);
                      startVideoUpload(finalUri);
                      videoDownloaded = true;
                      mediaCount++;
                    }
                  }
                }
              } catch (vidErr) {
                Sentry.addBreadcrumb({
                  category: "share-intent",
                  message: "Failed to download OG video",
                  data: { video: vidUrl, error: String(vidErr) },
                  level: "warning",
                });
              }
            }

            if (!videoDownloaded) {
              const imagesToDownload = meta.images?.length
                ? meta.images.slice(0, 10 - mediaCount)
                : meta.image
                  ? [meta.image]
                  : [];
              if (imagesToDownload.length > 0) {
                for (let i = 0; i < imagesToDownload.length; i++) {
                  if (mediaCount >= 10) break;
                  try {
                    const imgUrl = imagesToDownload[i];
                    const ext = imgUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] ?? "jpg";
                    const destFile = new ExpoFile(
                      Paths.cache,
                      `shared_link_image_${Date.now()}_${i}.${ext}`,
                    );
                    const response = await fetch(imgUrl);
                    if (response.ok) {
                      const arrayBuffer = await response.arrayBuffer();
                      if (arrayBuffer.byteLength > 500) {
                        destFile.write(new Uint8Array(arrayBuffer));
                        setAttachment("image", destFile.uri);
                        mediaCount++;
                      }
                    }
                  } catch (imgErr) {
                    Sentry.addBreadcrumb({
                      category: "share-intent",
                      message: "Failed to download OG image",
                      data: { image: imagesToDownload[i], error: String(imgErr) },
                      level: "warning",
                    });
                  }
                }
              }
            }

            if (!videoDownloaded && videosToDownload.length > 0) {
              const currentBody = useDraftStore.getState().draft.body;
              const link = shareIntent.webUrl!;
              const newBody = (currentBody ? `${currentBody}\n\n${link}` : link).slice(
                0,
                maxContentLength,
              );
              updateDraft({ body: newBody });
            }

            if (meta.externalUrl) {
              updateDraft({ linkUrl: meta.externalUrl });
            }
          })
          .catch((err: any) => {
            if (lastProcessedIntentRef.current !== currentIntentKey) return;
            updateDraft({ body: shareIntent.webUrl!.slice(0, maxContentLength) });
            Sentry.captureException(err, { tags: { feature: "share-intent-meta" } });
          })
          .finally(() => {
            if (lastProcessedIntentRef.current === currentIntentKey) {
              setIsProcessingShareLink(false);
            }
          });
      }
      if (shareIntent.files?.length) {
        const file = shareIntent.files[0];
        if (file.mimeType?.startsWith("image/")) {
          setAttachment("image", file.path);
        } else if (file.mimeType?.startsWith("video/")) {
          setAttachment("video", file.path);
          startVideoUpload(file.path);
        }
      }
      resetShareIntent();
    }, 50);

    return () => {
      if (shareTimeoutRef.current) {
        clearTimeout(shareTimeoutRef.current);
        shareTimeoutRef.current = null;
      }
    };
  }, [
    clearDraft,
    clearVideoUploads,
    draft.attachmentType,
    hasShareIntent,
    isEditMode,
    maxContentLength,
    maxTitleLength,
    params.editBody,
    params.editMedia,
    params.editTag,
    params.editTitle,
    params.editTopic,
    removeAttachment,
    removeVideoUpload,
    resetShareIntent,
    setAttachment,
    setImageDimensions,
    setIsPreparingVideo,
    setIsProcessingShareLink,
    setIsVideoMuted,
    setIsVideoPlaying,
    setLinkError,
    setLinkUrl,
    setSelectedContentWarning,
    setSelectedStickers,
    setShowLinkInput,
    shareIntent,
    startVideoUpload,
    updateDraft,
  ]);

  useEffect(() => {
    if (!params.videoUri) return;
    if (handledVideoParam === params.videoUri) return;

    handledVideoParam = params.videoUri;
    const oldUri = params.replacingUri || null;
    const origUri = params.originalVideoUri ?? params.videoUri;
    const w = params.videoWidth ? parseInt(params.videoWidth, 10) : 1920;
    const h = params.videoHeight ? parseInt(params.videoHeight, 10) : 1080;
    const ts = params.trimStart ? parseInt(params.trimStart, 10) : 0;
    const te = params.trimEnd ? parseInt(params.trimEnd, 10) : 0;
    VIDEO_META.set(params.videoUri, {
      originalUri: origUri,
      width: w,
      height: h,
      trimStart: ts,
      trimEnd: te,
    });

    if (oldUri && oldUri !== params.videoUri) {
      const { replaceMediaUri } = useDraftStore.getState();
      replaceMediaUri(oldUri, params.videoUri);
      removeVideoUpload(oldUri);
      VIDEO_META.delete(oldUri);
    } else {
      setAttachment("video", params.videoUri);
    }
    setIsVideoMuted(params.isMuted === "1");
    setIsPreparingVideo(false);
    startVideoUpload(params.videoUri);
  }, [
    params.videoUri,
    params.originalVideoUri,
    params.replacingUri,
    params.videoWidth,
    params.videoHeight,
    params.trimStart,
    params.trimEnd,
    params.isMuted,
    removeVideoUpload,
    setAttachment,
    setIsPreparingVideo,
    setIsVideoMuted,
    startVideoUpload,
  ]);
}
