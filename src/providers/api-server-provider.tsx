import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/src/api/client";
import { usePreferencesStore, getApiBaseUrl, type ApiServer } from "@/src/stores";
import { Text } from "@/src/components/ui/primitives";

type ApiServerContextType = {
  isRefreshing: boolean;
  switchServer: (server: ApiServer) => Promise<void>;
};

const ApiServerContext = createContext<ApiServerContextType | undefined>(undefined);

export const useApiServer = () => {
  const context = useContext(ApiServerContext);
  if (!context) {
    throw new Error("useApiServer must be used within ApiServerProvider");
  }
  return context;
};

export const ApiServerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const apiServer = usePreferencesStore((s) => s.apiServer);
  const setApiServer = usePreferencesStore((s) => s.setApiServer);
  const initializedRef = useRef(false);
  const previousServerRef = useRef<ApiServer>(apiServer);

  useEffect(() => {
    if (!initializedRef.current) {
      const baseUrl = getApiBaseUrl(apiServer);
      apiClient.setBaseUrl(baseUrl);
      initializedRef.current = true;
      previousServerRef.current = apiServer;
      return;
    }

    if (previousServerRef.current !== apiServer) {
      previousServerRef.current = apiServer;
    }
  }, [apiServer]);

  const switchServer = useCallback(async (server: ApiServer) => {
    if (server === previousServerRef.current) {
      return;
    }

    setIsRefreshing(true);

    try {
      const baseUrl = getApiBaseUrl(server);
      apiClient.setBaseUrl(baseUrl);

      queryClient.clear();
      await queryClient.invalidateQueries();
      queryClient.removeQueries();

      setApiServer(server);
      previousServerRef.current = server;

      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      throw error;
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient, setApiServer]);

  return (
    <ApiServerContext.Provider value={{ isRefreshing, switchServer }}>
      {children}
      {isRefreshing ? (
        <View style={styles.overlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={styles.loadingText}>Switching server...</Text>
          </View>
        </View>
      ) : null}
    </ApiServerContext.Provider>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
    elevation: 9999,
  },
  loadingContainer: {
    padding: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "500",
  },
});
