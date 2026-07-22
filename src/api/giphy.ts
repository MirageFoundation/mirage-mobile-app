/**
 * Giphy API Service
 *
 * Provides GIF search and trending functionality using the Giphy API.
 */

// Giphy API key - use environment variable if set, otherwise fall back to default key
const GIPHY_API_KEY = (
  process.env.EXPO_PUBLIC_GIPHY_API_KEY || "YEDuQCmeTLIqvbYzUnA7QTILBOA8JbQO"
).trim();

/**
 * Check if Giphy API key is configured
 */
export const isGiphyConfigured = (): boolean => {
  return GIPHY_API_KEY.length > 0;
};

const GIPHY_API_BASE = "https://api.giphy.com/v1/gifs";

// ============================================
// Types
// ============================================

export interface GiphyImage {
  url: string;
  width: string;
  height: string;
  size?: string;
}

export interface GiphyImages {
  original: GiphyImage;
  fixed_height: GiphyImage;
  fixed_height_small: GiphyImage;
  fixed_width: GiphyImage;
  fixed_width_small: GiphyImage;
  downsized: GiphyImage;
  downsized_small: GiphyImage;
  preview_gif: GiphyImage;
}

export interface GiphyGif {
  id: string;
  title: string;
  url: string;
  images: GiphyImages;
}

export interface GiphySearchResponse {
  data: GiphyGif[];
  pagination: {
    total_count: number;
    count: number;
    offset: number;
  };
}

export interface GifItem {
  id: string;
  title: string;
  /** Preview URL (smaller, for grid display) */
  previewUrl: string;
  /** Full URL (for sending in comments) */
  fullUrl: string;
  /** Original URL from Giphy */
  originalUrl: string;
  width: number;
  height: number;
}

// ============================================
// API Functions
// ============================================

/**
 * Transform Giphy API response to our GifItem format
 */
function transformGiphyGif(gif: GiphyGif): GifItem {
  return {
    id: gif.id,
    title: gif.title,
    // Use fixed_height_small for preview (fast loading)
    previewUrl: gif.images.fixed_height_small?.url || gif.images.fixed_height?.url,
    // Use downsized for full view (good balance of quality/size)
    fullUrl: gif.images.downsized?.url || gif.images.original?.url,
    // Original for highest quality
    originalUrl: gif.images.original?.url,
    width: parseInt(gif.images.fixed_height_small?.width || "200", 10),
    height: parseInt(gif.images.fixed_height_small?.height || "200", 10),
  };
}

/**
 * Search for GIFs on Giphy
 *
 * @param query - Search query
 * @param limit - Number of results (max 50, default 20)
 * @param offset - Offset for pagination
 * @returns Array of GIF items
 */
export async function searchGifs(
  query: string,
  limit: number = 20,
  offset: number = 0,
  signal?: AbortSignal,
): Promise<GifItem[]> {
  if (!isGiphyConfigured()) {
    console.warn("[Giphy] API key not configured. Set EXPO_PUBLIC_GIPHY_API_KEY in your .env file.");
    return [];
  }

  if (!query.trim()) {
    return getTrendingGifs(limit, offset, signal);
  }

  const params = new URLSearchParams({
    api_key: GIPHY_API_KEY,
    q: query,
    limit: String(limit),
    offset: String(offset),
    rating: "pg-13", // Filter out explicit content
    lang: "en",
  });

  const response = await fetch(`${GIPHY_API_BASE}/search?${params}`, { signal });

  if (!response.ok) {
    if (response.status === 403 || response.status === 401) {
      throw new Error("Invalid Giphy API key. Please check EXPO_PUBLIC_GIPHY_API_KEY.");
    }
    throw new Error(`Giphy search failed: ${response.status}`);
  }

  const data: GiphySearchResponse = await response.json();
  return data.data.map(transformGiphyGif);
}

/**
 * Get trending GIFs from Giphy
 *
 * @param limit - Number of results (max 50, default 20)
 * @param offset - Offset for pagination
 * @returns Array of GIF items
 */
export async function getTrendingGifs(
  limit: number = 20,
  offset: number = 0,
  signal?: AbortSignal,
): Promise<GifItem[]> {
  if (!isGiphyConfigured()) {
    console.warn("[Giphy] API key not configured. Set EXPO_PUBLIC_GIPHY_API_KEY in your .env file.");
    return [];
  }

  const params = new URLSearchParams({
    api_key: GIPHY_API_KEY,
    limit: String(limit),
    offset: String(offset),
    rating: "pg-13",
  });

  const response = await fetch(`${GIPHY_API_BASE}/trending?${params}`, { signal });

  if (!response.ok) {
    if (response.status === 403 || response.status === 401) {
      throw new Error("Invalid Giphy API key. Please check EXPO_PUBLIC_GIPHY_API_KEY.");
    }
    throw new Error(`Giphy trending failed: ${response.status}`);
  }

  const data: GiphySearchResponse = await response.json();
  return data.data.map(transformGiphyGif);
}

/**
 * Get a specific GIF by ID
 *
 * @param id - Giphy GIF ID
 * @returns GIF item or null if not found
 */
export async function getGifById(id: string): Promise<GifItem | null> {
  const params = new URLSearchParams({
    api_key: GIPHY_API_KEY,
  });

  const response = await fetch(`${GIPHY_API_BASE}/${id}?${params}`);

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`Giphy get failed: ${response.status}`);
  }

  const data: { data: GiphyGif } = await response.json();
  return transformGiphyGif(data.data);
}
