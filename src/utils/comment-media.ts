import * as Sentry from "@sentry/react-native";
import { uploadImageAndGetUrl } from "@/src/api/read/hooks/use-upload-media";

const HTTP_URL_REGEX = /^https?:\/\//i;
const HTTPS_URL_REGEX = /^https:\/\//i;

function getUriScheme(uri?: string | null): string | null {
  if (!uri) return null;
  const match = uri.match(/^([a-z][a-z0-9+.-]*):/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function captureCommentMediaException(
  error: unknown,
  operation: string,
  imageUri?: string | null,
  gifUrl?: string | null,
): void {
  Sentry.captureException(error, {
    tags: { feature: "comment", operation },
    extra: {
      hasImage: !!imageUri,
      hasGif: !!gifUrl,
      imageScheme: getUriScheme(imageUri),
      gifScheme: getUriScheme(gifUrl),
      imageIsLocalFile: imageUri?.startsWith("file://") ?? false,
    },
  });
}

export function composeCommentContent(text: string, mediaUrl?: string | null): string {
  const trimmedText = text.trim();
  if (!mediaUrl) return text;
  return trimmedText ? `${mediaUrl}\n\n${trimmedText}` : mediaUrl;
}

export async function resolveCommentMediaUrl(
  imageUri?: string | null,
  gifUrl?: string | null,
): Promise<string | null> {
  if (imageUri) {
    if (HTTP_URL_REGEX.test(imageUri)) return imageUri;

    Sentry.addBreadcrumb({
      category: "comment-media",
      message: "Uploading local comment image",
      level: "info",
      data: {
        imageScheme: getUriScheme(imageUri),
        imageIsLocalFile: imageUri.startsWith("file://"),
      },
    });

    let uploadedUrl: string;
    try {
      uploadedUrl = await uploadImageAndGetUrl(imageUri);
    } catch (error) {
      captureCommentMediaException(error, "comment_image_upload_failed", imageUri, gifUrl);
      throw error;
    }

    if (!HTTPS_URL_REGEX.test(uploadedUrl)) {
      const error = new Error("comment_image_upload_returned_invalid_url");
      captureCommentMediaException(error, "comment_image_upload_invalid_url", imageUri, gifUrl);
      throw error;
    }
    return uploadedUrl;
  }

  if (gifUrl) {
    if (!HTTPS_URL_REGEX.test(gifUrl)) {
      const error = new Error("comment_gif_url_must_use_https");
      captureCommentMediaException(error, "comment_gif_invalid_url", imageUri, gifUrl);
      throw error;
    }
    return gifUrl;
  }

  return null;
}
