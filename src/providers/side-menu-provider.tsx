import { createContext, useCallback, useContext, useRef } from "react";
import { Alert, Linking } from "react-native";
import { useRouter } from "@/src/navigation/guarded-router";
import {
  SideMenu,
  type SideMenuRef,
} from "@/src/components/molecules";
import { useAuthStore } from "@/src/stores";
import { useUserStatus } from "@/src/api/read/hooks";
import { useHomePostCardStore } from "@/src/pages/home/home-post-card-store";

type SideMenuContextType = {
  openSideMenu: () => void;
  closeSideMenu: () => void;
};

const SideMenuContext = createContext<SideMenuContextType>({
  openSideMenu: () => {},
  closeSideMenu: () => {},
});

export const useSideMenu = () => useContext(SideMenuContext);

export function SideMenuProvider({ children }: { children: React.ReactNode }) {
  const sideMenuRef = useRef<SideMenuRef>(null);
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const currentUser = useAuthStore((s) => s.user);
  const { refetch: refetchUserStatus } = useUserStatus({ enabled: false });

  const openSideMenu = useCallback(() => {
    refetchUserStatus();
    sideMenuRef.current?.present();
  }, [refetchUserStatus]);

  const closeSideMenu = useCallback(() => {
    sideMenuRef.current?.dismissImmediate();
  }, []);

  const handleSettings = useCallback(() => router.push("/settings"), [router]);
  const handleSubscription = useCallback(() => router.push("/subscription"), [router]);
  const handleSaved = useCallback(() => router.push("/saved-posts"), [router]);
  const handleHistory = useCallback(() => router.push("/history"), [router]);
  const handleFollowing = useCallback(() => {
    const id = currentUser?.walletAddress || currentUser?.username;
    if (id) router.push(`/user-following/${id}`);
  }, [router, currentUser?.walletAddress, currentUser?.username]);
  const handleTopics = useCallback(() => router.push("/topics"), [router]);
  const handleAgents = useCallback(() => router.push("/agents"), [router]);
  const handleInviteAndEarn = useCallback(() => router.push("/invite-and-earn"), [router]);
  const handleReferrals = useCallback(() => router.push("/referrals"), [router]);
  const handleQuests = useCallback(() => router.push("/quests"), [router]);
  const handleHelp = useCallback(() => Linking.openURL("https://mirage.foundation/faq").catch((e: Error) => Alert.alert("Couldn't open link", e.message)), []);
  const handleAbout = useCallback(() => Linking.openURL("https://mirage.foundation").catch((e: Error) => Alert.alert("Couldn't open link", e.message)), []);
  const handleLogout = useCallback(async () => {
    await logout();
    router.replace("/(tabs)");
  }, [logout, router]);

  const handleSideMenuOpen = useCallback(() => {
    useHomePostCardStore.getState().setSideMenuOpen(true);
  }, []);

  const handleSideMenuDismiss = useCallback(() => {
    useHomePostCardStore.getState().setSideMenuOpen(false);
  }, []);

  return (
    <SideMenuContext.Provider value={{ openSideMenu, closeSideMenu }}>
      {children}
      <SideMenu
        ref={sideMenuRef}
        onSettings={handleSettings}
        onSubscription={handleSubscription}
        onSaved={handleSaved}
        onHistory={handleHistory}
        onFollowing={handleFollowing}
        onTopics={handleTopics}
        onAgents={handleAgents}
        onInviteAndEarn={handleInviteAndEarn}
        onReferrals={handleReferrals}
        onQuests={handleQuests}
        onHelp={handleHelp}
        onAbout={handleAbout}
        onLogout={handleLogout}
        onOpen={handleSideMenuOpen}
        onDismiss={handleSideMenuDismiss}
      />
    </SideMenuContext.Provider>
  );
}
