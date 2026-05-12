import { Image, type ImageProps } from "expo-image";
import * as Sentry from "@sentry/react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";
import { StyleSheet } from "react-native-unistyles";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

const AVATAR_SIZES: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
  xxl: 80,
};

/**
 * DiceBear identicon URL — kept byte-compatible with the web app's
 * `web/frontend/src/utils/avatar.js`:
 *   - Same DiceBear major version (9.x)
 *   - Same style (`identicon`)
 *   - SVG output (resolution-independent; same as web)
 *   - Raw seed (no lowercase / trim); only `encodeURIComponent` for URL safety
 *   - Default fallback seed: "default"
 *
 * Identical URL = identical identicon across web and mobile for the
 * same user.
 */
const DICEBEAR_BASE = "https://api.dicebear.com/9.x";

function buildDicebearSvgUrl(seed: string | undefined) {
  const rawSeed = seed === null || seed === undefined ? "" : String(seed);
  const safeSeed = encodeURIComponent(rawSeed || "default");
  return `${DICEBEAR_BASE}/identicon/svg?seed=${safeSeed}`;
}

// In-memory SVG cache so each seed is fetched at most once per app
// session. Keyed by URL — survives unmount/remount of any Avatar.
const svgCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

async function fetchDicebearSvg(url: string): Promise<string> {
  const cached = svgCache.get(url);
  if (cached) return cached;

  const existing = inflight.get(url);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      svgCache.set(url, text);
      return text;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, promise);
  return promise;
}

type AvatarProps = Omit<ImageProps, "source"> & {
  /** Size preset or custom number */
  size?: AvatarSize | number;
  /**
   * Seed for DiceBear avatar generation.
   *
   * Convention: pass the user's `mirage1…` bech32 address so the avatar
   * stays stable across username changes. Mirrors the policy enforced
   * in the web app's `utils/avatar.js`.
   */
  seed?: string;
  /** Custom image source (overrides seed) */
  source?: ImageProps["source"];
  /** Border radius preset (all values render a circular avatar) */
  rounded?: "none" | "sm" | "md" | "lg" | "full";
  /** Show border around avatar */
  bordered?: boolean;
  /** DiceBear style variant (kept for API compat; only `identicon` is used) */
  variant?: "bottts" | "avataaars" | "identicon" | "shapes" | "thumbs";
  /**
   * Inner padding around the DiceBear identicon as a fraction of
   * `size`. The identicon renders transparently on top of the circular
   * container's background. Only applied when no custom `source` is
   * provided.
   */
  paddingRatio?: number;
  /** Custom style for the outer container (overrides bg/border) */
  containerStyle?: import("react-native").StyleProp<import("react-native").ViewStyle>;
};

export const Avatar = ({
  size = "md",
  seed,
  source,
  rounded = "none",
  bordered = false,
  variant: _variant = "identicon",
  paddingRatio = 0.18,
  style,
  containerStyle,
  ...imageProps
}: AvatarProps) => {
  const resolvedSize = typeof size === "number" ? size : AVATAR_SIZES[size];

  const handleImageError = useCallback<NonNullable<ImageProps["onError"]>>(
    (event) => {
      Sentry.addBreadcrumb({
        category: "avatar",
        message: "Avatar image failed to load",
        level: "warning",
        data: {
          hasSeed: Boolean(seed),
          size: resolvedSize,
          sourceType: typeof source,
        },
      });

      imageProps.onError?.(event);
    },
    [imageProps, seed, resolvedSize, source],
  );

  styles.useVariants({ rounded, bordered });

  // Identicon image is a square. The geometric minimum to inscribe a
  // square fully inside a circle is (1 - 1/√2)/2 ≈ 14.6% of the
  // diameter; we use `paddingRatio` (with that floor) so the identicon
  // sits comfortably inside the circular container.
  const requestedInset = Math.round(resolvedSize * paddingRatio);
  const minInsetForCircle = Math.ceil(resolvedSize * (1 - 1 / Math.SQRT2) / 2);
  const identiconInset = Math.max(requestedInset, minInsetForCircle);
  const innerSize = Math.max(1, resolvedSize - identiconInset * 2);

  const svgUrl = useMemo(
    () => (source ? null : buildDicebearSvgUrl(seed)),
    [source, seed],
  );

  // Synchronously read from cache so cached identicons render on the
  // first frame with no flicker; otherwise fetch and stash.
  const [svgXml, setSvgXml] = useState<string | null>(() =>
    svgUrl ? svgCache.get(svgUrl) ?? null : null,
  );

  useEffect(() => {
    if (!svgUrl) {
      setSvgXml(null);
      return;
    }
    const cached = svgCache.get(svgUrl);
    if (cached) {
      setSvgXml(cached);
      return;
    }
    let cancelled = false;
    fetchDicebearSvg(svgUrl)
      .then((xml) => {
        if (!cancelled) setSvgXml(xml);
      })
      .catch((error) => {
        Sentry.addBreadcrumb({
          category: "avatar",
          message: "Failed to fetch DiceBear SVG",
          level: "warning",
          data: { url: svgUrl, error: String(error) },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [svgUrl]);

  return (
    <View
      style={[
        styles.container,
        {
          width: resolvedSize,
          height: resolvedSize,
        },
        containerStyle,
      ]}
    >
      {source ? (
        <Image
          source={source}
          style={[styles.image, styles.imageRounded, style]}
          cachePolicy="memory-disk"
          contentFit="cover"
          {...imageProps}
          onError={handleImageError}
        />
      ) : (
        <View
          style={[
            styles.identiconWrapper,
            {
              width: innerSize,
              height: innerSize,
              top: identiconInset,
              left: identiconInset,
            },
          ]}
          pointerEvents="none"
        >
          {svgXml ? (
            <SvgXml
              xml={svgXml}
              width={innerSize}
              height={innerSize}
            />
          ) : null}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    overflow: "hidden",
    backgroundColor: theme.colors.background.subtle,
    // In light theme, draw a subtle hairline border around every
    // avatar so it reads against light backgrounds. Dark theme stays
    // borderless unless `bordered` is explicitly set.
    borderWidth: rt.themeName === "light" ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.border.default,

    variants: {
      rounded: {
        none: { borderRadius: 9999 },
        sm: { borderRadius: 9999 },
        md: { borderRadius: 9999 },
        lg: { borderRadius: 9999 },
        full: { borderRadius: 9999 },
      },
      bordered: {
        true: {
          borderWidth: 0.5,
          borderColor: theme.colors.border.default,
        },
        false: {},
      },
    },
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imageRounded: {
    variants: {
      rounded: {
        none: { borderRadius: 9999 },
        sm: { borderRadius: 9999 },
        md: { borderRadius: 9999 },
        lg: { borderRadius: 9999 },
        full: { borderRadius: 9999 },
      },
    },
  },
  identiconWrapper: {
    position: "absolute",
    backgroundColor: "transparent",
  },
}));
