import { setShareScheme } from "@/src/utils/share-scheme";

export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: string;
}) {
  console.log("[+native-intent] path:", path, "initial:", initial);
  const scheme = path.match(/^([^:]+):\/\//)?.[1];
  if (scheme) {
    console.log("[+native-intent] detected scheme:", scheme);
    setShareScheme(scheme);
  }
  return path;
}
