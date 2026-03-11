import { setShareScheme } from "@/src/utils/share-scheme";

export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: string;
}) {
  const scheme = path.match(/^([^:]+):\/\//)?.[1];
  if (scheme) {
    setShareScheme(scheme);
  }
  if (path.includes("dataUrl=") && path.includes("ShareKey")) {
    return "/(tabs)/create";
  }
  return path;
}
