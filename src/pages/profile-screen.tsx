import { useRouter } from "expo-router";
import { useCallback } from "react";
import { ScrollView, Share } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { ProfileHeader } from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import { useAuthStore } from "@/src/stores";

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

  return (
    <Box flex background="base">
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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

        {/* Placeholder for tabs and content */}
        <Box p="lg" gap="md">
          <Box
            p="md"
            rounded="lg"
            style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
          >
            <Text size="sm" mode="subtle" style={{ textAlign: "center" }}>
              Posts, Comments, and About tabs coming soon...
            </Text>
          </Box>
        </Box>
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
}));
