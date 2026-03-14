import { useEffect, useRef } from "react";
import { useCloudflareErrorStore } from "@/src/stores/cloudflare-error-store";
import { useToast } from "@/src/providers/toast-provider";

export function CloudflareErrorToast() {
 const hasError = useCloudflareErrorStore((s) => s.hasError);
 const errorCode = useCloudflareErrorStore((s) => s.errorCode);
 const toast = useToast();
 const toastIdRef = useRef<string | null>(null);

 useEffect(() => {
  if (hasError) {
   if (toastIdRef.current) return;

   const id = toast.show("error", {
    title: `Cloudflare error (${errorCode})`,
    duration: 0,
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
