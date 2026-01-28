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
  /** Seed for DiceBear avatar generation */
  seed?: string;
  /** Custom image source (overrides seed) */
  source?: ImageProps["source"];
  /** Border radius preset */
  rounded?: "none" | "sm" | "md" | "lg" | "full";
  /** Show border around avatar */
  bordered?: boolean;
  /** DiceBear style variant */
  variant?: "bottts" | "avataaars" | "identicon" | "shapes" | "thumbs";
};

export const Avatar = ({
  size = "md",
  seed,
  source,
  rounded = "full",
  bordered = false,
  variant = "identicon",
  style,
  ...imageProps
}: AvatarProps) => {
  const resolvedSize = typeof size === "number" ? size : AVATAR_SIZES[size];

  const stableSeed = seed ?? "default";

  const imageSource = useMemo(
    () =>
      source ?? {
        uri: `https://api.dicebear.com/9.x/${variant}/png?seed=${stableSeed}&size=${resolvedSize * 2}`,
      },
    [source, variant, stableSeed, resolvedSize],
  );

  styles.useVariants({ rounded, bordered });

  return (
    <View
      style={[styles.container, { width: resolvedSize, height: resolvedSize }]}
    >
      <Image
        source={imageSource}
        style={[styles.image, style]}
        cachePolicy="memory-disk"
        contentFit="cover"
        {...imageProps}
      />
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    overflow: "hidden",
    backgroundColor: theme.colors.background.subtle,

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
        false: {
          borderWidth: 0,
        },
      },
    },
  },
  image: {
    width: "100%",
    height: "100%",
  },
}));
