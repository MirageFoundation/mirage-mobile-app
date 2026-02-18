const MAX_MEDIA_ITEMS = 10;
const MAX_URL_LENGTH = 2048;

export interface MediaValidationError {
  message: string;
}

export function validateMedia(urls: string[]): MediaValidationError | null {
  if (urls.length > MAX_MEDIA_ITEMS) {
    return { message: `media exceeds limit: ${urls.length} > ${MAX_MEDIA_ITEMS}` };
  }
  for (let i = 0; i < urls.length; i++) {
    if (urls[i].length > MAX_URL_LENGTH) {
      return { message: `media[${i}] exceeds length limit: ${urls[i].length} > ${MAX_URL_LENGTH}` };
    }
    if (!urls[i].startsWith("https://")) {
      return { message: `media[${i}] must use https://` };
    }
  }
  return null;
}
