import { storage } from "@/src/stores/mmkv-storage";
import {
  buildPersistedQueryNamespace,
  buildPersistedQueryStorageKey,
} from "./persisted-post-cache";

export function removePersistedQueryCache(
  serverIdentity: string,
  viewerAddress?: string | null,
): void {
  const namespace = buildPersistedQueryNamespace(serverIdentity, viewerAddress);
  storage.remove(buildPersistedQueryStorageKey(namespace));
}
