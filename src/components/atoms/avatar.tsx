import { Image, type ImageProps } from "expo-image";
import * as Sentry from "@sentry/react-native";
import { useCallback, useMemo } from "react";
import { View } from "react-native";
import Svg, { Rect } from "react-native-svg";
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

const IDENTICON_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#d946ef",
  "#ec4899",
];

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildIdenticonCells(seed: string) {
  let hash = hashSeed(seed);
  const cells: { x: number; y: number }[] = [];

  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      hash = Math.imul(hash ^ (x + y * 5 + 1), 1103515245) + 12345;
      if ((hash >>> 0) % 2 === 0) {
        cells.push({ x, y });
        if (x !== 2) cells.push({ x: 4 - x, y });
      }
    }
  }

  return cells;
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
  /** Border radius preset */
  rounded?: "none" | "sm" | "md" | "lg" | "full";
  /** Show border around avatar */
  bordered?: boolean;
  /** DiceBear style variant */
  variant?: "bottts" | "avataaars" | "identicon" | "shapes" | "thumbs";
  /**
   * Inner padding around the identicon glyph as a fraction of `size`.
   * Defaults to `0` so the identicon fills the avatar edge-to-edge.
   * Only applied when no custom `source` is provided (i.e. when
   * rendering a DiceBear identicon).
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
  paddingRatio: _paddingRatio = 0,
  style,
  containerStyle,
  ...imageProps
}: AvatarProps) => {
  const resolvedSize = typeof size === "number" ? size : AVATAR_SIZES[size];

  // Keep the same seed policy as web: do NOT lowercase/trim. We render
  // the generated identicon locally so avatars are not blank when the
  // DiceBear CDN is slow or unreachable.
  const rawSeed = seed === null || seed === undefined ? "" : String(seed);
  const stableSeed = rawSeed || "default";
  const seedHash = useMemo(() => hashSeed(stableSeed), [stableSeed]);
  const identiconCells = useMemo(() => buildIdenticonCells(stableSeed), [stableSeed]);
  const identiconColor = IDENTICON_COLORS[seedHash % IDENTICON_COLORS.length];
  const identiconBackground = `${identiconColor}22`;

  const handleImageError = useCallback<NonNullable<ImageProps["onError"]>>(
    (event) => {
      Sentry.addBreadcrumb({
        category: "avatar",
        message: "Custom avatar image failed to load",
        level: "warning",
        data: {
          hasSeed: Boolean(rawSeed),
          size: resolvedSize,
          sourceType: typeof source,
        },
      });

      imageProps.onError?.(event);
    },
    [imageProps, rawSeed, resolvedSize, source],
  );

  styles.useVariants({ rounded, bordered });

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
        <Svg
          width={resolvedSize}
          height={resolvedSize}
          viewBox="0 0 5 5"
          style={[styles.svg, style]}
        >
          <Rect x="0" y="0" width="5" height="5" fill={identiconBackground} />
          {identiconCells.map((cell) => (
            <Rect
              key={`${cell.x}-${cell.y}`}
              x={cell.x}
              y={cell.y}
              width="1"
              height="1"
              fill={identiconColor}
            />
          ))}
        </Svg>
      )}
    </View>
  );
};

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    overflow: "hidden",
    backgroundColor: theme.colors.background.subtle,
    borderWidth: 0,

    variants: {
      rounded: {
        none: { borderRadius: 0 },
        sm: { borderRadius: 0 },
        md: { borderRadius: 0 },
        lg: { borderRadius: 0 },
        full: { borderRadius: 0 },
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
        none: { borderRadius: 0 },
        sm: { borderRadius: 0 },
        md: { borderRadius: 0 },
        lg: { borderRadius: 0 },
        full: { borderRadius: 0 },
      },
    },
  },
  svg: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
}));
