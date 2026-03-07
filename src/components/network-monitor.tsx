import { useEffect, useRef } from "react";
import { useNetworkState } from "@/src/hooks/use-network-state";
import { useAppState } from "@/src/hooks/use-app-state";
import { useToast } from "@/src/providers/toast-provider";

export function NetworkMonitor() {
  const { isConnected } = useNetworkState();
  const toast = useToast();
  const prevConnected = useRef(true);
  const offlineToastId = useRef<string | null>(null);
  const isInitial = useRef(true);

  useAppState({
    onForeground: () => {},
  });

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      prevConnected.current = isConnected;
      if (!isConnected) {
        offlineToastId.current = toast.show("error", {
          title: "No connection",
          description: "You're offline. Some features may not work.",
          duration: 5000,
        });
      }
      return;
    }

    if (!isConnected && prevConnected.current) {
      if (offlineToastId.current) {
        toast.dismiss(offlineToastId.current);
      }
      offlineToastId.current = toast.show("error", {
        title: "No connection",
        description: "You're offline. Some features may not work.",
        duration: 5000,
      });
    }

    if (isConnected && !prevConnected.current) {
      if (offlineToastId.current) {
        toast.dismiss(offlineToastId.current);
        offlineToastId.current = null;
      }
      toast.success("Back online");
    }

    prevConnected.current = isConnected;
  }, [isConnected]);

  return null;
}
