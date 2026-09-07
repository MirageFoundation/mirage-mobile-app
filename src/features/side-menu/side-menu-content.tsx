import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { formatCompactNumber } from "@/src/utils/format-number";
import { Text } from "@/src/components/ui/primitives";
import { LogoutConfirmationPopup } from "@/src/components/molecules/logout-confirmation-popup";
import {
  JoinedCommunitiesSection,
  FollowedUsersSection,
  LogoutMenuItem,
  MenuItem,
  SectionFooter,
  SectionHeader,
} from "./side-menu-components";
import { SIDE_MENU_SECTIONS } from "./side-menu-model";
import { SHOW_MORE_HITSLOP, styles } from "./side-menu-styles";
import { useSideMenuController } from "./use-side-menu-controller";

const VERSION = Constants.expoConfig?.version ?? "1.0.0";
const SHOW_BUILD_NOTES =
  __DEV__ ||
  process.env.EXPO_PUBLIC_ENV === "dev" ||
  process.env.EXPO_PUBLIC_ENV === "preview";

function VersionDetails() {
  const { theme } = useUnistyles();
  return (
    <View style={styles.versionContainer}>
      <Text style={{ color: theme.colors.text.subtle }} size="sm" weight="light">
        v{VERSION} ({Platform.OS})
      </Text>
      {SHOW_BUILD_NOTES ? (
        <>
          <Text style={{ color: theme.colors.text.subtle }} size="sm" weight="light">
            update 217
          </Text>
          <Text
            style={{ color: theme.colors.text.subtle, textAlign: "center" }}
            size="sm"
            weight="light"
          >
            Major Codebase optimisations, full app optimisation and bug fixes
          </Text>
        </>
      ) : null}
    </View>
  );
}

type Controller = ReturnType<typeof useSideMenuController>;

function NavigationSections({ controller }: { controller: Controller }) {
  return (
    <>
      {SIDE_MENU_SECTIONS.map((section) => (
        <View key={section.title}>
          <SectionHeader title={section.title} />
          {section.items.map((item) =>
            item.hideOnIos && Platform.OS === "ios" ? null : (
              <MenuItem
                key={item.action}
                iconName={item.iconName}
                title={item.title}
                subtitle={item.subtitle}
                onPress={() => controller.runAction(item.action)}
              />
            ),
          )}
          <SectionFooter />
        </View>
      ))}
    </>
  );
}

function LoggedInContent({ controller }: { controller: Controller }) {
  const { theme } = useUnistyles();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Balance ${formatCompactNumber(controller.balance)} MIRAGE, open profile`}
        onPress={controller.openBalance}
        style={({ pressed }) => [styles.balanceCard, pressed && { opacity: 0.7 }]}
      >
        <Text style={{ color: theme.colors.text.subtle, marginTop: 2 }} size="sm" weight="semibold">
          BALANCE
        </Text>
        <Text style={{ color: theme.colors.text.default }} size="xl" weight="bold">
          {formatCompactNumber(controller.balance)} MIRAGE
        </Text>
      </Pressable>
      <SectionFooter />
      <NavigationSections controller={controller} />
      <FollowedUsersSection
        users={controller.followedUsers}
        usernameMap={controller.usernameMap}
        loading={controller.isLoadingFollowed}
        canShowMore={controller.allFollowedUsers.length > controller.followedUsers.length}
        onShowMore={controller.showMoreFollowing}
        onUserPress={controller.openUser}
      />
      <JoinedCommunitiesSection
        topics={controller.joinedCommunities}
        loading={controller.isLoadingJoined}
        canShowMore={controller.allJoinedCommunities.length > controller.joinedCommunities.length}
        onShowMore={controller.showMoreFollowing}
        onCommunityPress={controller.openCommunity}
      />
      <SectionHeader title="Account" />
      <LogoutMenuItem onPress={() => controller.setShowLogoutPopup(true)} />
      <VersionDetails />
    </>
  );
}

function LoggedOutContent({ controller }: { controller: Controller }) {
  const { theme } = useUnistyles();
  return (
    <>
      <View style={styles.sectionHeaderRow}>
        <Text size="sm" weight="semibold" style={{ color: theme.colors.text.subtle }}>
          GET STARTED
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Switch node, current node ${controller.apiServer}`}
          onPress={controller.openServerModal}
          hitSlop={SHOW_MORE_HITSLOP}
          style={({ pressed }) => [styles.serverHeaderButton, pressed && { opacity: 0.7 }]}
        >
          <Text
            size="sm"
            weight="semibold"
            style={{ color: "#60A5FA", textDecorationLine: "underline" }}
          >
            {controller.apiServer}
          </Text>
        </Pressable>
      </View>
      <MenuItem iconName="person-add-outline" title="Create Account" subtitle="Set up your identity" onPress={controller.createAccount} />
      <MenuItem iconName="log-in-outline" title="Login" subtitle="I already have an account" onPress={controller.login} />
      <VersionDetails />
    </>
  );
}

function ServerModal({ controller }: { controller: Controller }) {
  const { theme } = useUnistyles();
  return (
    <Modal
      visible={controller.showServerModal}
      transparent
      animationType="fade"
      onRequestClose={() => controller.setShowServerModal(false)}
    >
      <Pressable style={styles.modalOverlay} onPress={() => controller.setShowServerModal(false)}>
        <View style={[styles.modalContent, { backgroundColor: theme.colors.background.default }]}>
          <Text size="lg" weight="bold" style={{ marginBottom: 16, textAlign: "center" }}>
            Switch Node
          </Text>
          {controller.servers.map((server) => {
            const isActive = server === controller.apiServer;
            const isSwitching = controller.switchingServer === server;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: isActive, disabled: !!controller.switchingServer }}
                accessibilityLabel={`Use node ${server}`}
                key={server}
                disabled={!!controller.switchingServer}
                onPress={async () => {
                  if (!isActive) await controller.switchApiServer(server);
                  controller.setShowServerModal(false);
                }}
                style={[
                  styles.modalOption,
                  {
                    backgroundColor: isActive ? `${theme.colors.primary[500]}10` : "transparent",
                    opacity: controller.switchingServer && !isSwitching ? 0.5 : 1,
                  },
                ]}
              >
                <View style={styles.modalOptionLabel}>
                  <Ionicons
                    name={isActive ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={isActive ? theme.colors.primary[500] : theme.colors.text.subtle}
                  />
                  <Text
                    size="md"
                    weight={isActive ? "semibold" : "regular"}
                    style={isActive ? { color: theme.colors.primary[500] } : undefined}
                  >
                    {server}
                  </Text>
                </View>
                {isSwitching ? <ActivityIndicator size="small" color={theme.colors.primary[500]} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}

export function SideMenuContent({ visible, close }: { visible: boolean; close: () => void }) {
  const controller = useSideMenuController({ visible, close });
  return (
    <>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {controller.isLoggedIn
          ? <LoggedInContent controller={controller} />
          : <LoggedOutContent controller={controller} />}
      </ScrollView>
      <LogoutConfirmationPopup
        visible={controller.showLogoutPopup}
        onCancel={() => controller.setShowLogoutPopup(false)}
        onConfirm={controller.handleLogoutConfirm}
        isLoading={controller.isLoggingOut}
      />
      <ServerModal controller={controller} />
    </>
  );
}
