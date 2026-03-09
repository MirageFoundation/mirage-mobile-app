import { useEffect, useRef } from "react";
import { useCloudflareErrorStore } from "@/src/stores/cloudflare-error-store";
import { useToast } from "@/src/providers/toast-provider";
import { useApiServer } from "@/src/providers/api-server-provider";
import { usePreferencesStore, type ApiServer } from "@/src/stores";
import { useServerList } from "@/src/hooks/use-server-list";

function getAlternateServer(current: ApiServer, servers: ApiServer[]): ApiServer | null {
 const other = servers.find((s) => s !== current);
 return other ?? null;
}

export function CloudflareErrorToast() {
 const hasError = useCloudflareErrorStore((s) => s.hasError);
 const { switchServer } = useApiServer();
 const toast = useToast();
 const apiServer = usePreferencesStore((s) => s.apiServer);
 const setShareServer = usePreferencesStore((s) => s.setShareServer);
 const { servers } = useServerList();
 const toastIdRef = useRef<string | null>(null);

 useEffect(() => {
  if (hasError) {
   const alternate = getAlternateServer(apiServer, servers);
   if (!alternate) return;

   if (toastIdRef.current) return;

   const id = toast.show("error", {
    title: `Cloudflare error — tap to switch to ${alternate}`,
    duration: 0,
    action: async () => {
     toast.dismiss(id);
     toastIdRef.current = null;
     useCloudflareErrorStore.getState().setHasError(false);
     try {
      await switchServer(alternate);
      setShareServer(alternate);
      toast.success(`Switched to ${alternate}`);
     } catch {
      toast.error("Failed to switch server");
     }
    },
   });
   toastIdRef.current = id;
  } else {
   if (toastIdRef.current) {
    toast.dismiss(toastIdRef.current);
    toastIdRef.current = null;
   }
  }
 }, [hasError]);

 return null;
}
