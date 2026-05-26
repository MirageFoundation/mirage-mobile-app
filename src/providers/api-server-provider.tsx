import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import * as Sentry from "@sentry/react-native";
import { Audio } from "expo-av";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/src/api/client";
import { resetServerScopedCache } from "@/src/api/cache/server-cache";
import { usePreferencesStore, getApiBaseUrl, type ApiServer } from "@/src/stores";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { Text } from "@/src/components/ui/primitives";
import { unregisterPush, registerPush } from "@/src/services/push-notifications";
import { walletService } from "@/src/services/wallet-service";
import { primeBootstrap } from "@/src/services/bootstrap";

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
    const baseUrl = getApiBaseUrl(apiServer);

    if (!initializedRef.current) {
      apiClient.setBaseUrl(baseUrl);
      initializedRef.current = true;
      previousServerRef.current = apiServer;
      return;
    }

    if (previousServerRef.current !== apiServer) {
      apiClient.setBaseUrl(baseUrl);
      resetServerScopedCache(queryClient);
      previousServerRef.current = apiServer;
    }
  }, [apiServer, queryClient]);

  const switchServer = useCallback(async (server: ApiServer) => {
    if (server === previousServerRef.current) {
      return;
    }

    setIsRefreshing(true);
    const previousServer = previousServerRef.current;

    Sentry.addBreadcrumb({
      category: "api-server",
      message: "Switching API server",
      level: "info",
      data: {
        from: previousServer,
        to: server,
      },
    });

    try {
      const wallet = await walletService.getWallet();
      await unregisterPush(wallet);

      const baseUrl = getApiBaseUrl(server);
      apiClient.setBaseUrl(baseUrl);

      resetServerScopedCache(queryClient);

      // Clear any video viewability/active state from the previous server and
      // keep feed playback suppressed while the settings screen is still on
      // top. The caller releases sideMenuOpen after navigating back home.
      useHomePostCardStore.setState({
        activeVideoPostIds: {},
        visibleVideoPostIds: {},
        nearbyVideoPostIds: {},
        sideMenuOpen: true,
      });

      setApiServer(server);
      previousServerRef.current = server;

      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      }).catch(() => {});

      await primeBootstrap(queryClient, wallet?.address);

      await new Promise((resolve) => setTimeout(resolve, 300));

      const walletAfterSwitch = await walletService.getWallet();
      if (walletAfterSwitch) {
        await registerPush(walletAfterSwitch);
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          feature: "api-server",
          action: "switch",
        },
        extra: {
          from: previousServer,
          to: server,
        },
      });
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
