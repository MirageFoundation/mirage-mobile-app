import { Box } from "@/components/ui/primitives/box";
import type { ImageProps } from "expo-image";
import { Image } from "expo-image";
import { useMemo } from "react";
import { StyleSheet } from "react-native-unistyles";

interface AvatarProps extends ImageProps {
  size?: number;
  seed?: string;
  rounded?: "none" | "sm" | "md" | "lg" | "xl" | "full";
  border?: "none" | "thin" | "thick";
}

export default function Avatar({
  source,
  seed,
  size = 42,
  style,
  rounded = "full",
  border = "thin",
  ...imageProps
}: AvatarProps) {
  const dynamicStyles = {
    imageContainer: {
      width: size,
      height: size,
    },
  };

  const imgSource = useMemo(() => {
    if (source) return source;
    // Convention: callers should pass the user's `mirage1…` bech32
    // address as seed so the identicon stays stable across username
    // changes. Mirrors web `utils/avatar.js`.
    const safeSeed = encodeURIComponent(
      seed === null || seed === undefined ? "default" : String(seed) || "default",
    );
    return {
      url: `https://api.dicebear.com/9.x/identicon/svg?seed=${safeSeed}`,
    };
  }, [source, seed]);

  return (
    <Box
      rounded={rounded === "full" ? "full" : rounded === "none" ? "none" : rounded}
      style={[styles.imageContainer, dynamicStyles.imageContainer]}
    >
      <Image
        style={[styles.image, style]}
        source={imgSource}
        cachePolicy={"memory-disk"}
        {...imageProps}
      />
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  imageContainer: {
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
}));
