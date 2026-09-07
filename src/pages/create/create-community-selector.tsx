import { Entypo } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import { useDraftStore } from "@/src/stores/draft-store";
import { triggerHaptic } from "@/src/components/utils/haptics";

import { useCreateComposeState } from "./create-compose-state";
import { styles } from "./create-screen-styles";

export function CreateCommunitySelector() {
  const { theme } = useUnistyles();
  const selectedCommunity = useDraftStore((state) => state.draft.community);
  const openCommunityModal = useCreateComposeState((state) => state.openCommunityModal);

  return (
    <>
      <Pressable
        onPress={() => {
          triggerHaptic("selection");
          openCommunityModal();
        }}
        style={[
          styles.communitySelector,
          {
            backgroundColor: theme.colors.background.lighter,
          },
        ]}
      >
        {selectedCommunity && (
          <Text
            size="xl"
            weight="bold"
            style={{ color: theme.colors.text.default }}
          >
            [
          </Text>
        )}
        <Text
          size="lg"
          weight="semibold"
          style={{ color: theme.colors.text.default }}
        >
          {selectedCommunity
            ? `${selectedCommunity.name.toLowerCase()}]`
            : "Select a community"}
        </Text>
        <Box style={{ marginLeft: 5 }}>
          <Entypo
            name="chevron-up"
            size={12}
            color={theme.colors.text.default}
            style={{ marginBottom: -5 }}
          />
          <Entypo
            name="chevron-down"
            size={12}
            color={theme.colors.text.default}
          />
        </Box>
      </Pressable>

      {selectedCommunity?.isNewCommunity && (
        <View
          style={[
            styles.newTopicWarning,
            { backgroundColor: theme.colors.warning[500] + "15" },
          ]}
        >
          <Text size="xs" style={{ lineHeight: 16, color: theme.colors.warning[500] }}>
            Communities are spaces centered around specific interests.
            Posting in the wrong community may affect your overall trust status
            on Mirage. Make sure to post into the right category!
          </Text>
        </View>
      )}
    </>
  );
}
