import { Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PostCardSkeletonList } from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import { HEADER_HEIGHT } from "@/src/providers/scroll-animation-context";
import { LoggedOutHome } from "../logged-out-home";
import { HomeScreenSections } from "./home-screen-sections";
import { useHomeScreenController } from "./use-home-screen-controller";

export function HomeScreen() {
  const controller = useHomeScreenController();
  const insets = useSafeAreaInsets();

  if (controller.entryState === "welcome") return <LoggedOutHome />;

  if (controller.entryState === "loading" || controller.entryState === "error") {
    return (
      <Box flex background="base" style={{ paddingTop: insets.top + HEADER_HEIGHT }}>
        {controller.entryState === "loading" ? (
          <PostCardSkeletonList count={5} />
        ) : (
          <Box flex center p="lg">
            <Text size="lg" weight="medium">Unable to load this server</Text>
            <Text size="sm" mode="subtle" style={{ marginTop: 8 }}>
              Check your connection and try again.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => { void controller.retryNodeConfig(); }}
              style={{ padding: 16 }}
            >
              <Text weight="semibold">Try again</Text>
            </Pressable>
          </Box>
        )}
      </Box>
    );
  }

  return <HomeScreenSections controller={controller} />;
}
