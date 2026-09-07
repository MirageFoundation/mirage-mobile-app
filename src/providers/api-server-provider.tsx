import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import * as Sentry from "@sentry/react-native";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/src/api/client";
import { resetServerScopedCache } from "@/src/api/cache/server-cache";
import { removePersistedQueryCache } from "@/src/api/cache/persisted-query-storage";
import { serverQueryRoot } from "@/src/api/server-runtime";
import { usePreferencesStore, getApiBaseUrl, type ApiServer } from "@/src/stores";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { Text } from "@/src/components/ui/primitives";
import { unregisterPush, registerPush } from "@/src/services/push-notifications";
import { walletService } from "@/src/services/wallet-service";
import { primeBootstrap } from "@/src/services/bootstrap";
import {
  requestVisitorAttributionDelivery,
  startVisitorAttributionLifecycle,
} from "@/src/services/visitor-attribution";

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
  const refreshingCountRef = useRef(0);

  useEffect(() => startVisitorAttributionLifecycle(), []);

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
      previousServerRef.current = apiServer;
    }
  }, [apiServer, queryClient]);

  const switchServer = useCallback(async (server: ApiServer) => {
    if (server === previousServerRef.current) {
      return;
    }

    refreshingCountRef.current += 1;
    setIsRefreshing(true);
    let previousServer = previousServerRef.current;
    let wallet = null as Awaited<ReturnType<typeof walletService.getWallet>>;

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
      const baseUrl = getApiBaseUrl(server);
      await apiClient.switchBaseUrl(baseUrl, {
        beforeCommit: async (previousContext) => {
          previousServer = previousServerRef.current;
          await queryClient.cancelQueries({
            queryKey: serverQueryRoot(previousContext.identity),
          });
          wallet = await walletService.getWallet();
          await unregisterPush(wallet);
          removePersistedQueryCache(previousContext.identity, wallet?.address);
        },
        afterCommit: async (previousContext) => {
          resetServerScopedCache(queryClient, previousContext.identity);

          // Clear any video viewability/active state from the previous server
          // and suppress playback until the caller navigates back home.
          useHomePostCardStore.setState({
            sideMenuOpen: true,
          });
          Sentry.addBreadcrumb({
            category: "feed-video",
            message: "Suppressed feed playback during API server switch",
            level: "info",
            data: { from: previousServer, to: server },
          });

          previousServerRef.current = server;
          setApiServer(server);
          await primeBootstrap(queryClient, wallet?.address);
          await new Promise((resolve) => setTimeout(resolve, 300));
        },
        rollback: (_previousContext, failedContext) => {
          if (failedContext) {
            resetServerScopedCache(queryClient, failedContext.identity);
          }
          previousServerRef.current = previousServer;
          setApiServer(previousServer);
        },
      });

      requestVisitorAttributionDelivery();

      const walletAfterSwitch = await walletService.getWallet();
      if (walletAfterSwitch) {
        await registerPush(walletAfterSwitch);
      }
    } catch (error) {
      if (wallet && previousServerRef.current === previousServer) {
        try {
          await registerPush(wallet);
        } catch (rollbackError) {
          Sentry.captureException(rollbackError, {
            tags: { feature: "api-server", action: "rollback-push" },
          });
        }
      }
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
      refreshingCountRef.current -= 1;
      if (refreshingCountRef.current === 0) {
        setIsRefreshing(false);
      }
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
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
