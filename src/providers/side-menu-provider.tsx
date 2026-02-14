import { createContext, useCallback, useContext, useRef } from "react";
import { Linking } from "react-native";
import { useRouter } from "expo-router";
import {
  SideMenu,
  type SideMenuRef,
} from "@/src/components/molecules";
import { useAuthStore } from "@/src/stores";
import { useUserStatus } from "@/src/api/read/hooks";

type SideMenuContextType = {
  openSideMenu: () => void;
};

const SideMenuContext = createContext<SideMenuContextType>({
  openSideMenu: () => {},
});

export const useSideMenu = () => useContext(SideMenuContext);

export function SideMenuProvider({ children }: { children: React.ReactNode }) {
  const sideMenuRef = useRef<SideMenuRef>(null);
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const currentUser = useAuthStore((s) => s.user);
  const { refetch: refetchUserStatus } = useUserStatus();

  const openSideMenu = useCallback(() => {
    refetchUserStatus();
    sideMenuRef.current?.present();
  }, [refetchUserStatus]);

  const handleSettings = useCallback(() => router.push("/settings"), [router]);
  const handleSubscription = useCallback(() => router.push("/subscription"), [router]);
  const handleSaved = useCallback(() => router.push("/saved-posts"), [router]);
  const handleHistory = useCallback(() => console.log("Navigate to history"), []);
  const handleDrafts = useCallback(() => console.log("Navigate to drafts"), []);
  const handleFollowing = useCallback(() => {
    const id = currentUser?.walletAddress || currentUser?.username;
    if (id) router.push(`/user-following/${id}`);
  }, [router, currentUser?.walletAddress, currentUser?.username]);
  const handleTopics = useCallback(() => router.push("/topics"), [router]);
  const handleInviteAndEarn = useCallback(() => router.push("/invite-and-earn"), [router]);
  const handleQuests = useCallback(() => router.push("/quests"), [router]);
  const handleHelp = useCallback(() => Linking.openURL("https://mirage.foundation/faq"), []);
  const handleAbout = useCallback(() => Linking.openURL("https://mirage.foundation"), []);
  const handleLogout = useCallback(async () => await logout(), [logout]);

  return (
    <SideMenuContext.Provider value={{ openSideMenu }}>
      {children}
      <SideMenu
        ref={sideMenuRef}
        onSettings={handleSettings}
        onSubscription={handleSubscription}
        onSaved={handleSaved}
        onHistory={handleHistory}
        onDrafts={handleDrafts}
        onFollowing={handleFollowing}
        onTopics={handleTopics}
        onInviteAndEarn={handleInviteAndEarn}
        onQuests={handleQuests}
        onHelp={handleHelp}
        onAbout={handleAbout}
        onLogout={handleLogout}
      />
    </SideMenuContext.Provider>
  );
}
