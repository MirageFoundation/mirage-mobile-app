import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Dimensions, ScrollView, Share, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { ProfileHeader, ProfileTabs } from "@/src/components/molecules";
import { Box } from "@/src/components/ui/primitives";
import { useAuthStore } from "@/src/stores";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  // Mock data for development
  const mockProfileData = {
    balance: 12450,
    reserve: 5230,
    accountAgeDays: 127, // ~4 months
  };

  const handleBackPress = useCallback(() => {
    router.back();
  }, [router]);

  const handleUsernamePress = useCallback(() => {
    // TODO: Show username options
    console.log("Username pressed");
  }, []);

  const handleSearchPress = useCallback(() => {
    // TODO: Navigate to search
    console.log("Search pressed");
  }, []);

  const handleSharePress = useCallback(async () => {
    try {
      await Share.share({
        message: `Check out @${user?.username} on Mirage!`,
        url: `https://mirage.app/u/${user?.username}`,
      });
    } catch (error) {
      console.error("Share error:", error);
    }
  }, [user?.username]);

  const handleMenuPress = useCallback(() => {
    // TODO: Show profile menu options
    console.log("Menu pressed");
  }, []);

  const handleEditPress = useCallback(() => {
    // TODO: Navigate to edit profile
    console.log("Edit pressed");
  }, []);

  const handleFollowersPress = useCallback(() => {
    // TODO: Navigate to followers list
    console.log("Followers pressed");
  }, []);

  const handleSettingsPress = useCallback(() => {
    // TODO: Navigate to settings
    console.log("Settings pressed");
  }, []);

  return (
    <Box flex background="base">
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {/* Profile Header */}
        <ProfileHeader
          username={user?.username || "user"}
          avatarSeed={user?.username}
          walletAddress={user?.walletAddress || "0x0000...0000"}
          followersCount={user?.followerCount || 0}
          balance={mockProfileData.balance}
          reserve={mockProfileData.reserve}
          accountAgeDays={mockProfileData.accountAgeDays}
          onBackPress={handleBackPress}
          onUsernamePress={handleUsernamePress}
          onSearchPress={handleSearchPress}
          onSharePress={handleSharePress}
          onMenuPress={handleMenuPress}
          onEditPress={handleEditPress}
          onFollowersPress={handleFollowersPress}
        />

        {/* Profile Tabs - Fixed height for PagerView to work */}
        <View style={styles.tabsContainer}>
          <ProfileTabs onSettingsPress={handleSettingsPress} />
        </View>
      </ScrollView>
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  tabsContainer: {
    height: SCREEN_HEIGHT * 0.6, // 60% of screen height for tabs
    minHeight: 450,
  },
}));
