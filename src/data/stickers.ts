const BUNNY_STICKER_CDN = "https://mirage-img.b-cdn.net";
const MEME_STICKER_COUNT = 97;

export const MEME_STICKERS: string[] = Array.from(
  { length: MEME_STICKER_COUNT },
  (_, index) => `${BUNNY_STICKER_CDN}/stickers/meme/${String(index + 1).padStart(2, "0")}.webp`,
);
