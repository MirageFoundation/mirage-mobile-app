import { Image, type ImageProps } from "expo-image";
import { useMemo } from "react";
import { View } from "react-native";
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
  rounded = "sm",
  bordered = false,
  variant = "identicon",
  paddingRatio = 0,
  style,
  containerStyle,
  ...imageProps
}: AvatarProps) => {
  const resolvedSize = typeof size === "number" ? size : AVATAR_SIZES[size];

  // Match web utils/avatar.js: do NOT lowercase/trim — pass the seed
  // verbatim, only URL-encode it so unsafe characters don't break the
  // request. Empty string falls back to "default".
  const rawSeed = seed === null || seed === undefined ? "" : String(seed);
  const stableSeed = encodeURIComponent(rawSeed || "default");

  const imageSource = useMemo(
    () =>
      source ?? {
        uri: `https://api.dicebear.com/9.x/${variant}/png?seed=${stableSeed}&size=${resolvedSize * 2}&scale=100`,
      },
    [source, variant, stableSeed, resolvedSize],
  );

  styles.useVariants({ rounded, bordered });

  // Only inset the identicon when we generated the source ourselves.
  // Custom `source` images (avatars, agent banners) should fill the
  // circle as they did before.
  const innerPadding = source
    ? 0
    : Math.round(resolvedSize * Math.max(0, paddingRatio));

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
      <Image
        source={imageSource}
        style={[
          styles.image,
          styles.imageRounded,
          source ? null : styles.identiconImage,
          innerPadding > 0
            ? {
                top: innerPadding,
                left: innerPadding,
                right: innerPadding,
                bottom: innerPadding,
              }
            : null,
          style,
        ]}
        cachePolicy="memory-disk"
        contentFit="cover"
        {...imageProps}
      />
    </View>
  );
};

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    overflow: "hidden",
    backgroundColor: theme.colors.background.subtle,
    borderWidth: rt.themeName === "light" ? 0.5 : 0,
    borderColor: theme.colors.border.default,

    variants: {
      rounded: {
        none: { borderRadius: 0 },
        sm: { borderRadius: theme.radius.sm },
        md: { borderRadius: theme.radius.md },
        lg: { borderRadius: theme.radius.lg },
        full: { borderRadius: theme.radius.full },
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
    position: "absolute",
    // Extend under the container's border so the avatar visually
    // touches the border edge with no gap. The container's
    // `overflow: hidden` + matching borderRadius clip the image
    // cleanly along the rounded outer edge.
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
  },
  imageRounded: {
    variants: {
      rounded: {
        none: { borderRadius: 0 },
        sm: { borderRadius: theme.radius.sm },
        md: { borderRadius: theme.radius.md },
        lg: { borderRadius: theme.radius.lg },
        full: { borderRadius: theme.radius.full },
      },
    },
  },
  // DiceBear identicons are transparent SVG/PNGs — `contain` keeps the
  // glyph within the inset padding without cropping.
  identiconImage: {
    backgroundColor: "transparent",
  },
}));
