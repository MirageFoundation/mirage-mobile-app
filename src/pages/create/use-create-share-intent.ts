import { useEffect, useRef, useState } from "react";
import { Audio } from "expo-av";
import { Paths, File as ExpoFile } from "expo-file-system";
import { useShareIntentContext } from "expo-share-intent";
import ExpoShareIntentModule from "expo-share-intent/build/ExpoShareIntentModule";
import * as Sentry from "@sentry/react-native";

import { router } from "@/src/navigation/guarded-router";
import {
  clearLastSharePath,
  getLastSharePath,
  isRecentSharePath,
} from "@/src/navigation/linking";
import {
  clearPendingShareIntent,
  getPendingShareIntent,
  getPendingShareIntentKey,
  persistPendingShareIntent,
} from "@/src/navigation/pending-launch-intents";
import { fetchLinkMeta } from "@/src/utils/fetch-link-meta";
import { mergeAudioVideo } from "@/src/utils/merge-audio-video";
import { sanitizeTopicName } from "@/src/utils/topic-validation";
import { trimToMaxDuration } from "@/src/utils/video-processing";
import { useDraftStore, type Community } from "@/src/stores/draft-store";
import { useCreateComposeState } from "./create-compose-state";
import { decodeHtmlEntities } from "./create-screen-utils";
import { VIDEO_META, setHandledVideoParam } from "./create-upload-state";

type CreateShareTierLimits = {
  maxContentLength: number;
  maxTitleLength: number;
};

type UseCreateShareIntentParams = {
  clearDraft: () => void;
  isEditMode: boolean;
  isAuthInitializing: boolean;
  isLoggedIn: boolean;
  removeAttachment: () => void;
  resetComposeState: () => void;
  resetImageUploads: () => void;
  resetVideoUploads: () => void;
  setAttachment: (type: "image" | "video", uri: string) => void;
  setIsProcessingShareLink: (value: boolean) => void;
  showAuthSheet: () => void;
  startImageUpload: (uri: string, silent?: boolean) => Promise<string | null> | undefined;
  startVideoUpload: (uri: string, silent?: boolean) => void;
  tierLimits: CreateShareTierLimits;
  updateDraft: (updates: Partial<{
    body: string;
    title: string;
    community: Community | null;
  }>) => void;
};

const extractSharedUrl = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/https?:\/\/[^\s<>()]+/i);
  if (!match) return null;
  return match[0]
    .replace(/[\])}.,!?;:'"\u201d\u2019]+$/u, "")
    .trim();
};

const shouldAutofillSharedUrlInLinkInput = (url: string | null) => {
  if (!url) return false;
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "share.google";
  } catch {
    return false;
  }
};

const autofillSharedLinkInput = (url: string) => {
  const { openLinkInput, setLinkUrl } = useCreateComposeState.getState();
  openLinkInput();
  setLinkUrl(url);
};

const isDirectDownloadableVideoUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtube.com" || host === "youtu.be") return false;
  } catch {}
  return /\.(mp4|mov|webm|m3u8|ts|gif)(\?|#|$)/i.test(url);
};

export function useCreateShareIntent({
  clearDraft,
  isEditMode,
  isAuthInitializing,
  isLoggedIn,
  removeAttachment,
  resetComposeState,
  resetImageUploads,
  resetVideoUploads,
  setAttachment,
  setIsProcessingShareLink,
  showAuthSheet,
  startImageUpload,
  startVideoUpload,
  tierLimits,
  updateDraft,
}: UseCreateShareIntentParams) {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const [pendingShareIntent, setPendingShareIntent] = useState(() => getPendingShareIntent());
  const lastProcessedIntentRef = useRef<string | null>(null);
  const shareIntentRecoveryPathRef = useRef<string | null>(null);
  const shareTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isEditMode) return;
    if (!hasShareIntent && !pendingShareIntent && !isRecentSharePath(60_000)) return;
    setIsProcessingShareLink(true);
  }, [hasShareIntent, isEditMode, pendingShareIntent, setIsProcessingShareLink]);

  useEffect(() => {
    if (!hasShareIntent || !shareIntent || isEditMode) return;
    const pending = persistPendingShareIntent(shareIntent, "share-intent-context");
    if (pending) {
      setPendingShareIntent(pending);
    }
  }, [hasShareIntent, isEditMode, shareIntent]);

  useEffect(() => {
    if (hasShareIntent || pendingShareIntent || isEditMode) return;

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const pending = getPendingShareIntent();
      if (pending) {
        setPendingShareIntent(pending);
        clearInterval(timer);
        return;
      }
      if (attempts >= 12) {
        clearInterval(timer);
      }
    }, 250);

    return () => clearInterval(timer);
  }, [hasShareIntent, isEditMode, pendingShareIntent]);

  useEffect(() => {
    if (hasShareIntent || pendingShareIntent || isEditMode) return;
    if (!isRecentSharePath(60_000)) return;
    const sharePath = getLastSharePath();
    if (!sharePath || sharePath === shareIntentRecoveryPathRef.current) return;
    shareIntentRecoveryPathRef.current = sharePath;
    console.log("[CreateScreen] Recovering share intent from launch path");
    Sentry.addBreadcrumb({
      category: "share-intent",
      message: "Recovering share intent from launch path",
      data: { pathPreview: sharePath.slice(0, 160) },
      level: "info",
    });
    try {
      const recoveredIntent = ExpoShareIntentModule?.getShareIntent(sharePath);
      const pending = persistPendingShareIntent(
        recoveredIntent && typeof recoveredIntent === "object" ? recoveredIntent : null,
        "create-screen-recovery",
        sharePath,
      );
      if (pending) {
        setPendingShareIntent(pending);
      } else {
        clearLastSharePath(sharePath);
        Sentry.addBreadcrumb({
          category: "share-intent",
          message: "Cleared stale share launch path after failed recovery",
          data: { pathPreview: sharePath.slice(0, 160) },
          level: "info",
        });
      }
    } catch (error) {
      clearLastSharePath(sharePath);
      Sentry.captureException(error, {
        tags: { feature: "share-intent", operation: "create-screen-recovery" },
      });
    }
  }, [hasShareIntent, isEditMode, pendingShareIntent]);

  useEffect(() => {
    const activeShareIntent = hasShareIntent ? shareIntent : pendingShareIntent;
    const isRecoveredPendingShareIntent = !hasShareIntent && !!pendingShareIntent;
    if (!activeShareIntent || isEditMode) return;

    if (isAuthInitializing) {
      Sentry.addBreadcrumb({
        category: "share-intent",
        message: "Waiting for auth initialization before handling share intent",
        data: {
          type: activeShareIntent.type,
          hasWebUrl: !!activeShareIntent.webUrl,
          hasText: !!activeShareIntent.text,
          fileCount: activeShareIntent.files?.length ?? 0,
          isRecoveredPendingShareIntent,
        },
        level: "info",
      });
      return;
    }

    if (!isLoggedIn) {
      Sentry.captureMessage("Share intent received while logged out", {
        level: "info",
        tags: { feature: "share-intent", operation: "logged-out-redirect" },
        extra: {
          type: activeShareIntent.type,
          hasWebUrl: !!activeShareIntent.webUrl,
          hasText: !!activeShareIntent.text,
          fileCount: activeShareIntent.files?.length ?? 0,
          isRecoveredPendingShareIntent,
        },
      });
      lastProcessedIntentRef.current = null;
      clearPendingShareIntent(getPendingShareIntentKey(activeShareIntent));
      setPendingShareIntent(null);
      setIsProcessingShareLink(false);
      if (hasShareIntent) {
        resetShareIntent();
      }
      router.replace("/(tabs)");
      showAuthSheet();
      return;
    }

    const intentKey = getPendingShareIntentKey(activeShareIntent);
    if (!intentKey || intentKey === lastProcessedIntentRef.current) return;
    lastProcessedIntentRef.current = intentKey;

    if (shareTimeoutRef.current) {
      clearTimeout(shareTimeoutRef.current);
      shareTimeoutRef.current = null;
    }
    const currentIntentKey = intentKey;
    const sharedTextUrl = extractSharedUrl(activeShareIntent.text);
    const sharedUrl = extractSharedUrl(activeShareIntent.webUrl) ?? sharedTextUrl;
    const shouldAutofillLinkInput = shouldAutofillSharedUrlInLinkInput(sharedUrl);
    const shouldImportSharedFiles = !sharedUrl;
    if (sharedUrl) {
      setIsProcessingShareLink(true);
    }
    const consumedLaunchPath = isRecoveredPendingShareIntent
      ? pendingShareIntent?.launchPath
      : getLastSharePath();

    clearPendingShareIntent(currentIntentKey);
    clearLastSharePath(consumedLaunchPath);
    setPendingShareIntent(null);
    Sentry.addBreadcrumb({
      category: "share-intent",
      message: "Cleared consumed share launch intent",
      data: {
        isRecoveredPendingShareIntent,
        hadLaunchPath: !!consumedLaunchPath,
        hasSharedUrl: !!sharedUrl,
        shouldImportSharedFiles,
      },
      level: "info",
    });

    console.log("[CreateScreen] Share intent received:", {
      type: activeShareIntent.type,
      webUrl: activeShareIntent.webUrl,
      text: activeShareIntent.text,
      files: activeShareIntent.files,
      isRecoveredPendingShareIntent,
    });

    Sentry.addBreadcrumb({
      category: "share-intent",
      message: "Processing share intent",
      data: {
        type: activeShareIntent.type,
        webUrl: activeShareIntent.webUrl,
        sharedUrl,
        extractedUrlFromText: !!sharedTextUrl,
        hasText: !!activeShareIntent.text,
        textLength: activeShareIntent.text?.length ?? 0,
        fileCount: activeShareIntent.files?.length ?? 0,
        isRecoveredPendingShareIntent,
      },
      level: "info",
    });

    if (!sharedUrl && (activeShareIntent.webUrl || activeShareIntent.text)) {
      Sentry.captureMessage("Share intent URL extraction failed", {
        level: "warning",
        tags: { feature: "share-intent", operation: "url-extraction" },
        extra: {
          type: activeShareIntent.type,
          webUrl: activeShareIntent.webUrl,
          textPreview: activeShareIntent.text?.slice(0, 300),
          textLength: activeShareIntent.text?.length ?? 0,
          fileCount: activeShareIntent.files?.length ?? 0,
          isRecoveredPendingShareIntent,
        },
      });
    }

    clearDraft();
    resetComposeState();
    removeAttachment();
    resetVideoUploads();
    resetImageUploads();
    VIDEO_META.clear();
    setHandledVideoParam(null);
    if (sharedUrl && shouldAutofillLinkInput) {
      autofillSharedLinkInput(sharedUrl);
    }
    Sentry.addBreadcrumb({
      category: "share-intent",
      message: "Create draft reset for share intent",
      data: { hasSharedUrl: !!sharedUrl, shouldAutofillLinkInput, shouldImportSharedFiles },
      level: "info",
    });

    const redditMatch = (sharedUrl ?? activeShareIntent.text ?? "").match(/reddit\.com\/r\/([^/]+)/i);
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
      if (activeShareIntent.text && !sharedUrl) {
        updateDraft({ body: activeShareIntent.text.slice(0, tierLimits.maxContentLength) });
      }
      if (sharedUrl) {
        setIsProcessingShareLink(true);
        console.log("[CreateScreen] Fetching link meta:", sharedUrl);
        fetchLinkMeta(sharedUrl).then(async (meta) => {
          if (lastProcessedIntentRef.current !== currentIntentKey) return;
          console.log("[CreateScreen] Link meta extracted:", {
            url: sharedUrl,
            title: meta.title,
            description: meta.description,
            domain: meta.domain,
            image: meta.image,
            images: meta.images,
            video: meta.video,
            videos: meta.videos,
            audioUrl: meta.audioUrl,
            audioUrls: meta.audioUrls,
          });
          Sentry.addBreadcrumb({
            category: "share-intent",
            message: "Link meta fetched",
            data: {
              domain: meta.domain,
              hasTitle: !!meta.title,
              hasDescription: !!meta.description,
              hasVideo: !!meta.video,
              videoCount: meta.videos?.length ?? 0,
              imageCount: meta.images?.length ?? 0,
              hasAudio: !!meta.audioUrl || (meta.audioUrls?.length ?? 0) > 0,
            },
            level: "info",
          });
          let finalTitle: string | undefined;
          let titleOverflow = "";
          const applyAutofillTitle = (title: string) => {
            const decodedTitle = decodeHtmlEntities(title).trim();
            const splitTitleAtLimit = (text: string) => {
              const limitedText = text.slice(0, tierLimits.maxTitleLength);
              const sentenceEnd = Math.max(limitedText.lastIndexOf(". "), limitedText.lastIndexOf("! "), limitedText.lastIndexOf("? "));
              if (sentenceEnd <= 0) {
                return { titlePart: "", overflowPart: text };
              }
              const splitAt = sentenceEnd + 1;
              return {
                titlePart: text.slice(0, splitAt).trim(),
                overflowPart: text.slice(splitAt).trim(),
              };
            };
            finalTitle = decodedTitle;
            if (decodedTitle.length > tierLimits.maxTitleLength) {
              const lines = decodedTitle.split("\n");
              let titlePart = "";
              let overflowLines: string[] = [];
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const candidate = titlePart ? `${titlePart}\n${line}` : line;
                if (candidate.length <= tierLimits.maxTitleLength) {
                  titlePart = candidate;
                } else {
                  overflowLines = lines.slice(i);
                  break;
                }
              }
              if (!titlePart && overflowLines[0]) {
                const split = splitTitleAtLimit(overflowLines[0].trim());
                titlePart = split.titlePart;
                overflowLines = [split.overflowPart, ...overflowLines.slice(1)].filter(Boolean);
              }
              finalTitle = titlePart || undefined;
              titleOverflow = overflowLines.join("\n").trim();
            }
            if (finalTitle) {
              updateDraft({ title: finalTitle });
            }
          };
          if (meta.domain === "instagram.com") {
            let instagramTitle = "";
            if (meta.title) {
              const igCaptionMatch = meta.title.match(/on\s+Instagram:\s*"(.+)"/s);
              if (igCaptionMatch) {
                instagramTitle = igCaptionMatch[1];
              }
            }
            instagramTitle = decodeHtmlEntities(instagramTitle)
              .replace(/\([^)]*\)/g, "")
              .replace(/\[[^\]]*\]/g, "")
              .replace(/#\w+/g, "")
              .replace(/\b[A-Z][a-z]+(?:[A-Z][a-z]*)+\b/g, "")
              .replace(/[.…][\s.…]*[.…]/g, "")
              .replace(/\s{2,}/g, " ")
              .trim();
            if (instagramTitle) {
              applyAutofillTitle(instagramTitle);
            }
          } else if (meta.title) {
            finalTitle = meta.title;
            if ((meta.domain === "x.com" || meta.domain === "twitter.com") && /^.+\s+\(@\w+\)$/.test(finalTitle)) {
              finalTitle = undefined;
            }
            if (finalTitle) {
              applyAutofillTitle(finalTitle);
            }
          }
          const bodyParts: string[] = [];
          if (meta.domain !== "instagram.com" && !finalTitle && meta.description) {
            const desc = decodeHtmlEntities(meta.description);
            const lines = desc.split("\n");
            applyAutofillTitle(lines[0]);
            const remainingLines = lines.slice(1);
            const remaining = remainingLines.join("\n").trim();
            if (remaining) {
              bodyParts.push(remaining.slice(0, tierLimits.maxContentLength));
            }
          } else if (meta.domain !== "instagram.com" && meta.description && meta.description !== meta.title) {
            const desc = decodeHtmlEntities(meta.description);
            bodyParts.push(desc.slice(0, tierLimits.maxContentLength));
          }
          if (titleOverflow) {
            bodyParts.unshift(titleOverflow);
          }
          if (meta.externalUrl && !bodyParts.includes(meta.externalUrl)) {
            bodyParts.push(meta.externalUrl);
          }
          const extractedBody = bodyParts.join("\n\n").trim();
          const finalBody = extractedBody.slice(0, tierLimits.maxContentLength);
          updateDraft({ title: finalTitle ?? "", body: finalBody });
          console.log("[CreateScreen] Draft auto-filled:", {
            title: finalTitle?.slice(0, tierLimits.maxTitleLength),
            body: finalBody.slice(0, 200),
            community: redditMatch ? sanitizeTopicName(redditMatch[1]) : null,
          });
          Sentry.addBreadcrumb({
            category: "share-intent",
            message: "Draft auto-filled from link meta",
            data: {
              domain: meta.domain,
              hasTitle: !!finalTitle,
              titleLength: finalTitle?.length ?? 0,
              bodyLength: finalBody.length,
              hasBody: finalBody.length > 0,
              addedExternalUrlToBody: !!meta.externalUrl,
              autofilledSharedUrlInLinkInput: shouldAutofillLinkInput,
            },
            level: "info",
          });

          if (meta.externalUrl) {
            console.log("[CreateScreen] External link detected:", meta.externalUrl);
          }

          let videoDownloaded = false;
          let mediaCount = 0;
          const hasVideoCandidate = (meta.videos?.length ?? 0) > 0 || !!meta.video;

          const videosToDownload = Array.from(
            new Set(
              meta.videos?.length > 0
                ? meta.videos
                : meta.video
                  ? [meta.video]
                  : []
            )
          ).filter(isDirectDownloadableVideoUrl).slice(0, 10);
          Sentry.addBreadcrumb({
            category: "share-intent",
            message: "Resolved share media candidates",
            data: {
              domain: meta.domain,
              hasVideoCandidate,
              downloadableVideoCount: videosToDownload.length,
              imageCount: meta.images?.length ?? 0,
              hasFallbackImage: !!meta.image,
            },
            level: "info",
          });

          if (videosToDownload.length === 0 && meta.images?.length > 0) {
            Sentry.addBreadcrumb({
              category: "share-intent",
              message: "No video URLs found in link meta, using images",
              data: { domain: meta.domain, imageCount: meta.images.length, sharedUrl },
              level: "info",
            });
          }

          const isOomError = (err: unknown) => {
            const msg = String(err);
            return msg.includes("allocat") || msg.includes("OOM") || msg.includes("out of memory");
          };

          for (let vi = 0; vi < videosToDownload.length; vi++) {
            if (mediaCount >= 10) break;
            const vidUrl = videosToDownload[vi];
            try {
              const fetchHeaders = {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
                "Referer": meta.domain ? `https://${meta.domain}/` : "https://www.reddit.com/",
                "Accept": "*/*",
              };

              let finalUri: string | null = null;

              try {
                const response = await fetch(vidUrl, { headers: fetchHeaders });
                if (!response.ok) {
                  Sentry.addBreadcrumb({ category: "share-intent", message: "Video download failed", data: { status: response.status, vidUrl }, level: "warning" });
                  continue;
                }
                const contentType = response.headers.get("content-type") ?? "";
                const isVideoContent = contentType.startsWith("video/") || contentType.startsWith("application/octet-stream") || contentType.startsWith("binary/octet-stream") || contentType === "image/gif" || contentType.startsWith("application/mp4");
                const videoExtRe = /\.(mp4|mov|webm|m3u8|ts|gif)(\?|#|$)/i;
                if (!isVideoContent && !videoExtRe.test(response.url) && !videoExtRe.test(vidUrl)) {
                  Sentry.captureMessage("Video URL returned non-video content", {
                    level: "warning",
                    tags: { feature: "share-intent", domain: meta.domain },
                    extra: { vidUrl, contentType, resolvedUrl: response.url },
                  });
                  continue;
                }

                const arrayBuffer = await response.arrayBuffer();
                if (arrayBuffer.byteLength <= 1000) continue;

                let audioMerged = false;
                if (vi === 0) {
                  const audioUrlsToTry = meta.audioUrls?.length > 0
                    ? meta.audioUrls
                    : meta.audioUrl
                      ? [meta.audioUrl]
                      : [];
                  for (const tryAudioUrl of audioUrlsToTry) {
                    if (audioMerged) break;
                    try {
                      const audioRes = await fetch(tryAudioUrl, { headers: fetchHeaders });
                      if (!audioRes.ok) continue;
                      const audioBuffer = await audioRes.arrayBuffer();
                      if (audioBuffer.byteLength < 500) continue;
                      const audioContentType = audioRes.headers.get("content-type") ?? "";
                      if (audioContentType.includes("text/html") || audioContentType.includes("text/xml")) continue;
                      const mergedBuffer = await mergeAudioVideo(arrayBuffer, audioBuffer);
                      const mergedFile = new ExpoFile(Paths.cache, `shared_link_merged_${Date.now()}_${vi}.mp4`);
                      mergedFile.write(new Uint8Array(mergedBuffer));
                      let mergedUri = mergedFile.uri;
                      try {
                        const { sound } = await Audio.Sound.createAsync({ uri: mergedFile.uri });
                        const status = await sound.getStatusAsync();
                        await sound.unloadAsync();
                        if (status.isLoaded && status.durationMillis && status.durationMillis > 59000) {
                          mergedUri = await trimToMaxDuration(mergedFile.uri, status.durationMillis);
                        }
                      } catch {}
                      finalUri = mergedUri;
                      audioMerged = true;
                      Sentry.addBreadcrumb({ category: "share-intent", message: "Audio+video merged (RAM)", level: "info" });
                    } catch (mergeErr) {
                      Sentry.addBreadcrumb({ category: "share-intent", message: "Audio merge attempt failed", data: { error: String(mergeErr) }, level: "warning" });
                    }
                  }
                }

                if (!audioMerged) {
                  const ext = contentType.includes("mp4") ? "mp4"
                    : contentType.includes("webm") ? "webm"
                    : contentType.includes("quicktime") ? "mov"
                    : contentType === "image/gif" ? "gif"
                    : vidUrl.match(/\.(mp4|mov|webm|gif)/i)?.[1] ?? "mp4";
                  const destFile = new ExpoFile(Paths.cache, `shared_link_video_${Date.now()}_${vi}.${ext}`);
                  destFile.write(new Uint8Array(arrayBuffer));
                  let videoUri = destFile.uri;
                  try {
                    const { sound } = await Audio.Sound.createAsync({ uri: destFile.uri });
                    const status = await sound.getStatusAsync();
                    await sound.unloadAsync();
                    if (status.isLoaded && status.durationMillis && status.durationMillis > 59000) {
                      videoUri = await trimToMaxDuration(destFile.uri, status.durationMillis);
                    }
                  } catch {}
                  finalUri = videoUri;
                }
              } catch (ramErr) {
                if (!isOomError(ramErr)) throw ramErr;
                Sentry.captureMessage("Share intent: OOM during RAM download, falling back to disk", {
                  level: "warning",
                  tags: { feature: "share-intent", domain: meta.domain },
                  extra: { vidUrl, error: String(ramErr) },
                });

                const ext = vidUrl.match(/\.(mp4|mov|webm|m3u8|gif)/i)?.[1] ?? "mp4";
                const destFile = new ExpoFile(Paths.cache, `shared_link_video_${Date.now()}_${vi}.${ext}`);
                const downloadedFile = await ExpoFile.downloadFileAsync(vidUrl, destFile, {
                  headers: fetchHeaders,
                });
                const fileSize = downloadedFile.size ?? 0;
                if (fileSize <= 1000) {
                  try { downloadedFile.delete(); } catch {}
                  continue;
                }
                let diskUri = downloadedFile.uri;
                try {
                  const { sound } = await Audio.Sound.createAsync({ uri: downloadedFile.uri });
                  const status = await sound.getStatusAsync();
                  await sound.unloadAsync();
                  if (status.isLoaded && status.durationMillis && status.durationMillis > 59000) {
                    diskUri = await trimToMaxDuration(downloadedFile.uri, status.durationMillis);
                  }
                } catch {}
                finalUri = diskUri;
              }

              if (finalUri) {
                setAttachment("video", finalUri);
                startVideoUpload(finalUri);
                videoDownloaded = true;
                mediaCount++;
                Sentry.addBreadcrumb({
                  category: "share-intent",
                  message: "Shared link video attached",
                  data: { domain: meta.domain, videoIndex: vi, mediaCount },
                  level: "info",
                });
              }
            } catch (vidErr) {
              Sentry.captureMessage("Share intent: video download threw exception", {
                level: "warning",
                tags: { feature: "share-intent", domain: meta.domain },
                extra: { video: vidUrl, error: String(vidErr) },
              });
            }
          }

          if (!videoDownloaded && videosToDownload.length > 0) {
            Sentry.captureMessage("Share intent: video URLs found but all downloads failed, falling back to images", {
              level: "warning",
              tags: { feature: "share-intent", domain: meta.domain },
              extra: {
                videoUrls: videosToDownload.slice(0, 3),
                videoCount: videosToDownload.length,
                imageCount: meta.images?.length ?? 0,
                sharedUrl,
              },
            });
          }

          if (!videoDownloaded && hasVideoCandidate && videosToDownload.length === 0) {
            Sentry.captureMessage("Share intent: video candidates were not downloadable", {
              level: "warning",
              tags: { feature: "share-intent", operation: "media-extraction" },
              extra: {
                domain: meta.domain,
                sharedUrl,
                rawVideo: meta.video,
                rawVideos: meta.videos?.slice(0, 5) ?? [],
                imageCount: meta.images?.length ?? 0,
                hasFallbackImage: !!meta.image,
              },
            });
          }

          if (!videoDownloaded) {
            const imagesToDownload = Array.from(
              new Set(
                meta.images?.length > 0
                  ? meta.images
                  : meta.image
                    ? [meta.image]
                    : []
              )
            ).slice(0, 10 - mediaCount);
            if (imagesToDownload.length > 0) {
              for (let i = 0; i < imagesToDownload.length; i++) {
                if (mediaCount >= 10) break;
                try {
                  const imgUrl = imagesToDownload[i];
                  const ext = imgUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] ?? "jpg";
                  const destFile = new ExpoFile(Paths.cache, `shared_link_image_${Date.now()}_${i}.${ext}`);
                  const response = await fetch(imgUrl);
                  if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    if (arrayBuffer.byteLength > 500) {
                      destFile.write(new Uint8Array(arrayBuffer));
                      setAttachment("image", destFile.uri);
                      startImageUpload(destFile.uri, true)?.catch(() => {});
                      mediaCount++;
                      Sentry.addBreadcrumb({
                        category: "share-intent",
                        message: "Shared link image attached",
                        data: { domain: meta.domain, imageIndex: i, mediaCount },
                        level: "info",
                      });
                    }
                  } else {
                    Sentry.addBreadcrumb({
                      category: "share-intent",
                      message: "Shared link image download failed",
                      data: { domain: meta.domain, imageIndex: i, status: response.status },
                      level: "warning",
                    });
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

          const shouldAddSharedUrlFallback =
            !shouldAutofillLinkInput &&
            ((!videoDownloaded && hasVideoCandidate) ||
              (!finalTitle && !finalBody && mediaCount === 0));

          if (shouldAddSharedUrlFallback) {
            const currentBody = useDraftStore.getState().draft.body;
            const link = sharedUrl;
            if (link && !currentBody.includes(link)) {
              const newBody = (currentBody ? `${link}\n\n${currentBody}` : link).slice(0, tierLimits.maxContentLength);
              updateDraft({ body: newBody });
              Sentry.addBreadcrumb({
                category: "share-intent",
                message: "Prepended shared URL fallback to body",
                data: {
                  domain: meta.domain,
                  reason: !videoDownloaded && hasVideoCandidate ? "video-not-imported" : "empty-draft",
                  previousBodyLength: currentBody.length,
                  newBodyLength: newBody.length,
                },
                level: "info",
              });
            } else if (link) {
              Sentry.addBreadcrumb({
                category: "share-intent",
                message: "Shared URL fallback already present in body",
                data: { domain: meta.domain, bodyLength: currentBody.length },
                level: "info",
              });
            }
          }

          Sentry.addBreadcrumb({
            category: "share-intent",
            message: "Share intent link processing complete",
            data: {
              domain: meta.domain,
              videoDownloaded,
              hasVideoCandidate,
              mediaCount,
              addedSharedUrlFallback: shouldAddSharedUrlFallback,
              autofilledSharedUrlInLinkInput: shouldAutofillLinkInput,
            },
            level: "info",
          });

          if (!shouldAddSharedUrlFallback && !finalTitle && !finalBody && mediaCount === 0) {
            Sentry.captureMessage("Share intent link extraction completed with empty draft", {
              level: "warning",
              tags: { feature: "share-intent", operation: "link-extraction" },
              extra: {
                domain: meta.domain,
                sharedUrl,
                hasVideoCandidate,
                downloadableVideoCount: videosToDownload.length,
                imageCount: meta.images?.length ?? 0,
                hasFallbackImage: !!meta.image,
                autofilledSharedUrlInLinkInput: shouldAutofillLinkInput,
              },
            });
          }

          if (meta.externalUrl) {
            console.log("[CreateScreen] Keeping external link out of link input:", meta.externalUrl);
          }
        }).catch((err: any) => {
          if (lastProcessedIntentRef.current !== currentIntentKey) return;
          if (!shouldAutofillLinkInput) {
            updateDraft({
              body: sharedUrl.slice(0, tierLimits.maxContentLength),
            });
          }
          Sentry.captureException(err, {
            tags: { feature: "share-intent-meta", operation: "fetch-link-meta" },
            extra: {
              sharedUrl,
              shouldAutofillLinkInput,
              isRecoveredPendingShareIntent,
              fileCount: activeShareIntent.files?.length ?? 0,
              textLength: activeShareIntent.text?.length ?? 0,
            },
          });
        }).finally(() => {
          if (lastProcessedIntentRef.current === currentIntentKey) {
            lastProcessedIntentRef.current = null;
            setIsProcessingShareLink(false);
            clearPendingShareIntent(currentIntentKey);
            setPendingShareIntent(null);
            setIsProcessingShareLink(false);
            if (hasShareIntent) {
              resetShareIntent();
            }
          }
        });
        return;
      }
      if (activeShareIntent.files?.length && shouldImportSharedFiles) {
        const file = activeShareIntent.files[0];
        if (!file.path) {
          Sentry.captureMessage("Share intent file missing path", {
            level: "warning",
            tags: { feature: "share-intent", operation: "file-import" },
            extra: {
              mimeType: file.mimeType,
              fileCount: activeShareIntent.files.length,
              isRecoveredPendingShareIntent,
            },
          });
        }
        Sentry.addBreadcrumb({
          category: "share-intent",
          message: "Importing shared file attachment",
          data: {
            mimeType: file.mimeType,
            fileCount: activeShareIntent.files.length,
            isRecoveredPendingShareIntent,
          },
          level: "info",
        });
        if (file.path && file.mimeType?.startsWith("image/")) {
          setAttachment("image", file.path);
          startImageUpload(file.path, true)?.catch(() => {});
        } else if (file.path && file.mimeType?.startsWith("video/")) {
          setAttachment("video", file.path);
          startVideoUpload(file.path);
        }
      }
      if (!sharedUrl && lastProcessedIntentRef.current === currentIntentKey) {
        lastProcessedIntentRef.current = null;
      }
      clearPendingShareIntent(currentIntentKey);
      setPendingShareIntent(null);
      if (hasShareIntent) {
        resetShareIntent();
      }
    }, 50);

    return () => {
      if (shareTimeoutRef.current && lastProcessedIntentRef.current !== currentIntentKey) {
        clearTimeout(shareTimeoutRef.current);
        shareTimeoutRef.current = null;
      }
    };
  }, [
    clearDraft,
    hasShareIntent,
    isEditMode,
    isAuthInitializing,
    isLoggedIn,
    removeAttachment,
    resetComposeState,
    resetImageUploads,
    resetShareIntent,
    resetVideoUploads,
    setAttachment,
    setIsProcessingShareLink,
    pendingShareIntent,
    shareIntent,
    showAuthSheet,
    startImageUpload,
    startVideoUpload,
    tierLimits.maxContentLength,
    tierLimits.maxTitleLength,
    updateDraft,
  ]);
}
