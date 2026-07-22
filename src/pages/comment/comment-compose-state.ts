import {
  GIPHY_URL_REGEX,
  HTTP_URL_REGEX,
  URL_REGEX,
  extractImageUrls,
  looksLikeUrlWithoutProtocol,
} from "./comment-compose-utils";

export type CommentComposeDraft = {
  text: string;
  imageUri?: string | null;
  gifUrl?: string | null;
};

export type InitialCommentComposeState = {
  text: string;
  imageUri: string | null;
  gifUrl: string | null;
  isRemoteImage: boolean;
};

export function getInitialCommentComposeState({
  draft,
  editContent,
  isEditMode,
}: {
  draft: CommentComposeDraft | null;
  editContent?: string;
  isEditMode: boolean;
}): InitialCommentComposeState {
  if (isEditMode && editContent) {
    const { text, imageUrls } = extractImageUrls(editContent);
    const attachmentUrl = imageUrls[0] ?? null;
    const isGif = !!attachmentUrl && GIPHY_URL_REGEX.test(attachmentUrl);
    return {
      text,
      imageUri: isGif ? null : attachmentUrl,
      gifUrl: isGif ? attachmentUrl : null,
      isRemoteImage: !!attachmentUrl && !isGif && HTTP_URL_REGEX.test(attachmentUrl),
    };
  }

  const draftGifUrl = draft?.gifUrl ?? null;
  const draftImageUri = draftGifUrl ? null : draft?.imageUri ?? null;
  return {
    text: draft?.text ?? "",
    imageUri: draftImageUri,
    gifUrl: draftGifUrl,
    isRemoteImage: !!draftImageUri && HTTP_URL_REGEX.test(draftImageUri),
  };
}

export function getLinkError(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (URL_REGEX.test(trimmed)) return null;
  if (looksLikeUrlWithoutProtocol(trimmed)) {
    return "Add https:// to the beginning of your link";
  }
  return "Please enter a valid URL (e.g., https://example.com)";
}

export function prependMarkdownLink(text: string, name: string, url: string): string {
  const markdownLink = `[${name.trim()}](${url.trim()})`;
  return text.trim() ? `${markdownLink}\n${text}` : markdownLink;
}

export function removeMarkdownLink(text: string, markdown: string): string {
  return text.replace(markdown, "").replace(/\n{2,}/g, "\n").trim();
}

export function getCommentComposeLimits({
  attachmentUrl,
  editExpired,
  imageError,
  imageUploading,
  isPreparingImage,
  isSubmitting,
  maxContentLength,
  text,
}: {
  attachmentUrl: string | null;
  editExpired: boolean;
  imageError: string | null;
  imageUploading: boolean;
  isPreparingImage: boolean;
  isSubmitting: boolean;
  maxContentLength: number;
  text: string;
}) {
  const hasAttachment = attachmentUrl !== null;
  const effectiveMaxLength = Math.max(
    1,
    maxContentLength - (attachmentUrl ? attachmentUrl.length + 2 : 0),
  );
  const imageUploadBlocked =
    !!attachmentUrl && (isPreparingImage || imageUploading || !!imageError);

  return {
    effectiveMaxLength,
    canSubmit:
      (text.trim().length > 0 || hasAttachment) &&
      !editExpired &&
      !imageUploadBlocked &&
      !isSubmitting,
  };
}
