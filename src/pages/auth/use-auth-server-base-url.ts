import { apiClient } from "@/src/api/client";
import { type ApiServer, usePreferencesStore } from "@/src/stores";
import { useEffect } from "react";

export function useAuthServerBaseUrl(activeServer: ApiServer) {
  useEffect(() => {
    apiClient.setBaseUrl(`https://${activeServer}`);
  }, [activeServer]);

  useEffect(() => {
    return () => {
      const currentServer = usePreferencesStore.getState().apiServer;
      apiClient.setBaseUrl(`https://${currentServer}`);
    };
  }, []);
}
