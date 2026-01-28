import type { ImageProps } from "expo-image";
import { useMemo } from "react";
import Avatar from "./avatar";

interface DicebearAvatarProps extends Omit<ImageProps, "source"> {
  seed?: string;
  size?: number;
  rounded?: "none" | "sm" | "md" | "lg" | "xl" | "full";
  border?: "none" | "thin" | "thick";
  variant?: string;
  fallback?: string;
}

export default function DicebearAvatar({
  seed,
  variant = "identicon",
  size = 42,
  rounded = "full",
  border = "thin",
  fallback,
  ...props
}: DicebearAvatarProps) {
  const dicebearUrl = useMemo(() => {
    const s = seed || fallback;
    if (!s) return undefined;
    return `https://api.dicebear.com/9.x/${variant}/png?seed=${s}`;
  }, [seed, fallback, variant]);

  return (
    <Avatar
      size={size}
      rounded={rounded}
      border={border}
      cachePolicy={"memory-disk"}
      source={{ uri: dicebearUrl }}
      {...props}
    />
  );
}
