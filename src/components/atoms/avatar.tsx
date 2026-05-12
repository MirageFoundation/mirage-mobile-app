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
  // xorshift32 PRNG seeded from the FNV-1a hash of `seed`. xorshift
  // mixes all bits well, so consecutive samples vary across the whole
  // word — sampling the high bit gives a balanced ~50/50 fill that
  // differs noticeably between seeds.
  let state = hashSeed(seed) || 0x9e3779b9;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  // Burn a few rounds so the first samples aren't correlated with the
  // raw FNV output.
  next();
  next();
  next();

  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      if ((next() >>> 31) === 1) {
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
  /** Border radius preset (all values render a circular avatar) */
  rounded?: "none" | "sm" | "md" | "lg" | "full";
  /** Show border around avatar */
  bordered?: boolean;
  /** DiceBear style variant */
  variant?: "bottts" | "avataaars" | "identicon" | "shapes" | "thumbs";
  /**
   * Inner padding around the DiceBear identicon glyph as a fraction of
   * `size`. The identicon renders transparently on top of the circular
   * container's tinted background. Only applied when no custom
   * `source` is provided.
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

  // Identicon is a 5×5 square. To fit it fully inside the circle and
  // leave breathing room, inset by at least the geometric minimum
  // (1 - 1/√2)/2 ≈ 14.6% of the diameter.
  const requestedInset = Math.round(resolvedSize * paddingRatio);
  const minInsetForCircle = Math.ceil(resolvedSize * (1 - 1 / Math.SQRT2) / 2);
  const identiconInset = Math.max(requestedInset, minInsetForCircle);
  const innerSize = Math.max(1, resolvedSize - identiconInset * 2);
  const isIdenticon = !source;

  return (
    <View
      style={[
        styles.container,
        {
          width: resolvedSize,
          height: resolvedSize,
        },
        // Tint the circular container with the seed color so the
        // identicon sits on a colored disc instead of its own square.
        isIdenticon ? { backgroundColor: identiconBackground } : null,
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
        >
          <Svg
            width={innerSize}
            height={innerSize}
            viewBox="0 0 5 5"
            style={style}
          >
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
        </View>
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
