import { useEffect, useRef } from "react";
import { useCloudflareErrorStore } from "@/src/stores/cloudflare-error-store";
import { useToast } from "@/src/providers/toast-provider";

export function CloudflareErrorToast() {
 const hasError = useCloudflareErrorStore((s) => s.hasError);
 const errorCode = useCloudflareErrorStore((s) => s.errorCode);
 const toast = useToast();
 const toastIdRef = useRef<string | null>(null);

 useEffect(() => {
  if (toastIdRef.current) {
   toast.dismiss(toastIdRef.current);
   toastIdRef.current = null;
  }

  if (hasError) {
   const id = toast.show("error", {
    title: `Cloudflare error (${errorCode})`,
    duration: 0,
   });
   toastIdRef.current = id;
  }
 }, [errorCode, hasError, toast]);

 useEffect(() => {
  return () => {
   if (toastIdRef.current) {
    toast.dismiss(toastIdRef.current);
    toastIdRef.current = null;
   }
  };
 }, [toast]);

 return null;
}
