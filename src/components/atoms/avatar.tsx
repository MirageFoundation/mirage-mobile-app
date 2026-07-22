import { Image, type ImageProps } from "expo-image";
import * as Sentry from "@sentry/react-native";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { parse, SvgAst, type JsxAST } from "react-native-svg";
import { StyleSheet } from "react-native-unistyles";
import { getAvatarSourcePolicy, getAvatarSvgRenderKey } from "./avatar-source-policy";
import { AvatarSvgCache } from "./avatar-svg-cache";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

const AVATAR_SIZES: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
  xxl: 80,
};

const AVATAR_SVG_CACHE_LIMIT = 128;
const AVATAR_INFLIGHT_LIMIT = 32;
let avatarCacheEvictions = 0;
const reportAvatarCacheEviction = (_key: string, _value: unknown, entryCount: number) => {
  avatarCacheEvictions += 1;
  if (__DEV__ && avatarCacheEvictions % 32 === 1) {
    Sentry.addBreadcrumb({
      category: "cache.avatar",
      message: "Avatar SVG cache evicted least-recently-used entry",
      level: "info",
      data: { entryCount, capacity: AVATAR_SVG_CACHE_LIMIT, evictionCount: avatarCacheEvictions },
    });
  }
};
const svgCache = new AvatarSvgCache<JsxAST>(
  AVATAR_SVG_CACHE_LIMIT,
  AVATAR_INFLIGHT_LIMIT,
  reportAvatarCacheEviction,
);

function fetchDicebearSvg(url: string): Promise<JsxAST> {
  return svgCache.load(
    url,
    async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
    (xml) => {
      const ast = parse(xml);
      if (!ast) throw new Error("DiceBear SVG was empty");
      return ast;
    },
  );
}

const ParsedAvatarSvg = memo(function ParsedAvatarSvg({
  ast,
  size,
}: {
  ast: JsxAST;
  size: number;
}) {
  return <SvgAst ast={ast} override={{ width: size, height: size }} />;
});

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

  const sourcePolicy = useMemo(
    () => getAvatarSourcePolicy(source, seed),
    [source, seed],
  );
  const svgUrl = sourcePolicy.kind === "generated-svg" ? sourcePolicy.uri : null;

  // Synchronously read from cache so cached identicons render on the
  // first frame with no flicker. Mounted state retains ownership if its
  // LRU entry is later evicted, while new mounts parse the SVG again.
  const [svgState, setSvgState] = useState<{ key: string; ast: JsxAST } | null>(() => {
    if (!svgUrl) return null;
    const cached = svgCache.get(svgUrl);
    return cached ? { key: svgUrl, ast: cached } : null;
  });
  const svgAst = svgState?.key === svgUrl ? svgState.ast : null;

  useEffect(() => {
    if (!svgUrl) {
      setSvgState(null);
      return;
    }
    const cached = svgCache.get(svgUrl);
    if (cached) {
      setSvgState({ key: svgUrl, ast: cached });
      return;
    }
    let cancelled = false;
    fetchDicebearSvg(svgUrl)
      .then((ast) => {
        if (!cancelled) setSvgState({ key: svgUrl, ast });
      })
      .catch((error) => {
        Sentry.addBreadcrumb({
          category: "avatar",
          message: "Failed to fetch DiceBear SVG",
          level: "warning",
          data: { cacheEntryCount: svgCache.size, error: String(error) },
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
          {svgAst ? (
            <ParsedAvatarSvg
              key={getAvatarSvgRenderKey(svgUrl ?? "", innerSize)}
              ast={svgAst}
              size={innerSize}
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
