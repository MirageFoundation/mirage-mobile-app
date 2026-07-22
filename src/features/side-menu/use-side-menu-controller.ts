import * as Sentry from "@sentry/react-native";
import { usePathname } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Linking } from "react-native";

import {
  useBatchUsernamesFromAddresses,
  useUserFollowed,
  useUserStatus,
} from "@/src/api/read/hooks";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useServerList } from "@/src/hooks/use-server-list";
import { useRouter } from "@/src/navigation/guarded-router";
import { useApiServer } from "@/src/providers/api-server-provider";
import { useToast } from "@/src/providers/toast-provider";
import {
  type ApiServer,
  useAuthStore,
  usePreferencesStore,
} from "@/src/stores";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import {
  createSideMenuRouteDelegate,
  getFollowedTopicDestination,
  getFollowedUserDestination,
  type SideMenuAction,
} from "./side-menu-model";

type ControllerOptions = {
  visible: boolean;
  close: () => void;
};

export function useSideMenuController({ visible, close }: ControllerOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { switchServer } = useApiServer();
  const { servers } = useServerList();
  const [showLogoutPopup, setShowLogoutPopup] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showServerModal, setShowServerModal] = useState(false);
  const [switchingServer, setSwitchingServer] = useState<ApiServer | null>(null);
  const shouldCloseAfterAuthRef = useRef(false);

  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const {
    apiServer,
    setShareServer,
    topicsBeforeShowMore,
    peopleBeforeShowMore,
  } = usePreferencesStore();

  const { data: userStatus, refetch: refetchUserStatus } = useUserStatus({
    enabled: visible && isLoggedIn,
  });
  const { data: followedData, isLoading: isLoadingFollowed } = useUserFollowed();
  const allFollowedUsers = followedData?.followed_users ?? [];
  const allFollowedTopics = followedData?.followed_topics ?? [];
  const followedUsers = peopleBeforeShowMore === -1
    ? allFollowedUsers
    : allFollowedUsers.slice(0, peopleBeforeShowMore);
  const followedTopics = topicsBeforeShowMore === -1
    ? allFollowedTopics
    : allFollowedTopics.slice(0, topicsBeforeShowMore);
  const { data: usernameMap } = useBatchUsernamesFromAddresses(allFollowedUsers, {
    enabled: visible,
  });
  const balance = userStatus?.balance
    ? Math.floor(userStatus.balance / 1_000_000)
    : 0;

  useEffect(() => {
    if (!visible || !isLoggedIn) return;
    void refetchUserStatus();
    const refreshAfterIndexerLag = setTimeout(() => {
      void refetchUserStatus();
    }, 3000);
    return () => clearTimeout(refreshAfterIndexerLag);
  }, [visible, isLoggedIn, pathname, refetchUserStatus]);

  useEffect(() => {
    if (!isLoggedIn || !shouldCloseAfterAuthRef.current) return;
    shouldCloseAfterAuthRef.current = false;
    if (visible) {
      Sentry.addBreadcrumb({
        category: "side-menu",
        message: "Closing side menu after auth success",
        level: "info",
      });
      close();
    }
  }, [close, isLoggedIn, visible]);

  const openExternal = useCallback((url: string) => {
    Linking.openURL(url).catch((error: Error) => {
      Alert.alert("Couldn't open link", error.message);
    });
  }, []);

  const delegateRoute = useMemo(
    () => createSideMenuRouteDelegate({
      navigation: {
        push: (destination) => router.push(destination as never),
        replace: (destination) => router.replace(destination as never),
      },
      user,
      openExternal,
    }),
    [openExternal, router, user],
  );

  const runAction = useCallback((action: SideMenuAction) => {
    triggerHaptic("light");
    delegateRoute(action);
  }, [delegateRoute]);

  const beginAuth = useCallback((destination: "/(auth)/username" | "/(auth)/login", message: string) => {
    triggerHaptic("light");
    shouldCloseAfterAuthRef.current = true;
    Sentry.addBreadcrumb({ category: "side-menu", message, level: "info" });
    router.push(destination);
  }, [router]);

  const handleLogoutConfirm = useCallback(async () => {
    Sentry.addBreadcrumb({
      category: "side-menu",
      message: "Logout confirmation submitted",
      level: "info",
      data: { hasLogoutHandler: true },
    });
    setIsLoggingOut(true);
    try {
      await logout();
      router.replace("/(tabs)");
      Sentry.addBreadcrumb({
        category: "side-menu",
        message: "Logout completed from side menu",
        level: "info",
      });
      setShowLogoutPopup(false);
      close();
    } catch (error) {
      Sentry.captureException(error, {
        tags: { feature: "side-menu", operation: "logout" },
      });
      setShowLogoutPopup(true);
      toast.error("Logout failed. Please try again.");
    } finally {
      setIsLoggingOut(false);
    }
  }, [close, logout, router, toast]);

  const openServerModal = useCallback(() => {
    Sentry.addBreadcrumb({
      category: "side-menu",
      message: "Node selector opened",
      level: "info",
      data: { serverCount: servers.length, currentServer: apiServer },
    });
    setShowServerModal(true);
  }, [apiServer, servers.length]);

  const switchApiServer = useCallback(async (server: ApiServer) => {
    if (server === apiServer) return;
    Sentry.addBreadcrumb({
      category: "side-menu",
      message: "Node switch started",
      level: "info",
      data: { fromServer: apiServer, toServer: server },
    });
    setSwitchingServer(server);
    try {
      await switchServer(server);
      setShareServer(server);
      Sentry.addBreadcrumb({
        category: "side-menu",
        message: "Node switch succeeded",
        level: "info",
        data: { fromServer: apiServer, toServer: server },
      });
      toast.success(`Switched to ${server}`);
      router.replace("/(tabs)");
      setTimeout(() => {
        close();
        useHomePostCardStore.getState().setSideMenuOpen(false);
        Sentry.addBreadcrumb({
          category: "feed-video",
          message: "Released feed playback after side-menu server switch",
          level: "info",
          data: { server },
        });
      }, 350);
    } catch (error) {
      Sentry.captureException(error, {
        tags: { feature: "side-menu", operation: "switch-node" },
        extra: { fromServer: apiServer, toServer: server },
      });
      toast.error("Failed to switch server");
      useHomePostCardStore.getState().setSideMenuOpen(false);
      Sentry.addBreadcrumb({
        category: "feed-video",
        message: "Released feed playback after failed side-menu server switch",
        level: "warning",
        data: { server },
      });
    } finally {
      setSwitchingServer(null);
    }
  }, [apiServer, close, router, setShareServer, switchServer, toast]);

  const showMoreFollowing = useCallback(() => {
    triggerHaptic("light");
    if (user?.walletAddress) router.push(`/user-following/${user.walletAddress}`);
  }, [router, user?.walletAddress]);
  const openUser = useCallback((address: string) => {
    triggerHaptic("light");
    router.push(getFollowedUserDestination(address) as never);
  }, [router]);
  const openTopic = useCallback((topic: string) => {
    triggerHaptic("light");
    router.push(getFollowedTopicDestination(topic) as never);
  }, [router]);

  return {
    isLoggedIn,
    balance,
    apiServer,
    servers,
    switchingServer,
    showServerModal,
    setShowServerModal,
    openServerModal,
    switchApiServer,
    followedUsers,
    followedTopics,
    allFollowedUsers,
    allFollowedTopics,
    usernameMap,
    isLoadingFollowed,
    showMoreFollowing,
    openUser,
    openTopic,
    runAction,
    createAccount: () => beginAuth("/(auth)/username", "Create account started from side menu"),
    login: () => beginAuth("/(auth)/login", "Login started from side menu"),
    showLogoutPopup,
    setShowLogoutPopup,
    isLoggingOut,
    handleLogoutConfirm,
  };
}
