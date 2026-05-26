import { Entypo, Feather } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import type { Community } from "@/src/stores/draft-store";
import { styles } from "./annotate-styles";
import { AnnotateToggle } from "./annotate-toggle";

type AnnotateTopicTagSectionProps = {
  selectedCommunity: Community | null;
  selectedTag: string;
  tagEnabled: boolean;
  topicEnabled: boolean;
  onClearTag: () => void;
  onOpenCommunity: () => void;
  onOpenTag: () => void;
  onToggleTag: () => void;
  onToggleTopic: () => void;
};

export function AnnotateTopicTagSection({
  selectedCommunity,
  selectedTag,
  tagEnabled,
  topicEnabled,
  onClearTag,
  onOpenCommunity,
  onOpenTag,
  onToggleTag,
  onToggleTopic,
}: AnnotateTopicTagSectionProps) {
  const { theme } = useUnistyles();

  return (
    <>
      <AnnotateToggle
        label="Topic"
        enabled={topicEnabled}
        onToggle={onToggleTopic}
        theme={theme}
      >
        <Pressable
          onPress={onOpenCommunity}
          style={[
            styles.selectorButton,
            { backgroundColor: theme.colors.background.light },
          ]}
        >
          {selectedCommunity && (
            <Text
              size="lg"
              weight="bold"
              style={{ color: theme.colors.text.default }}
            >
              #
            </Text>
          )}
          <Text
            size="md"
            weight="semibold"
            style={{ color: theme.colors.text.default }}
          >
            {selectedCommunity?.name?.toLowerCase() ?? "Select a topic"}
          </Text>
          <Box style={{ marginLeft: 8 }}>
            <Entypo
              name="chevron-up"
              size={10}
              color={theme.colors.text.default}
              style={{ marginBottom: -4 }}
            />
            <Entypo
              name="chevron-down"
              size={10}
              color={theme.colors.text.default}
            />
          </Box>
        </Pressable>
      </AnnotateToggle>

      {topicEnabled && selectedCommunity?.isNewTopic && (
        <View
          style={[
            styles.newTopicWarning,
            { backgroundColor: theme.colors.warning[500] + "15" },
          ]}
        >
          <Text size="xs" mode="subtle" style={{ lineHeight: 16 }}>
            Topics are communities centered around specific interests. Posting in the wrong topic may affect your overall trust status on Mirage. Make sure to post into the right category!
          </Text>
        </View>
      )}

      <AnnotateToggle
        label="Tag"
        enabled={tagEnabled}
        onToggle={onToggleTag}
        theme={theme}
      >
        {selectedTag ? (
          <Pressable
            onPress={onOpenTag}
            style={[
              styles.selectorButton,
              { backgroundColor: theme.colors.background.light, gap: theme.spacing.sm },
            ]}
          >
            <Text
              size="md"
              weight="bold"
              style={{ color: theme.colors.warning[500] }}
            >
              ⚠️ {selectedTag.charAt(0).toUpperCase() + selectedTag.slice(1)}
            </Text>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                triggerHaptic("selection");
                onClearTag();
              }}
              hitSlop={8}
            >
              <Feather
                name="x"
                size={14}
                color={theme.colors.text.subtle}
              />
            </Pressable>
          </Pressable>
        ) : (
          <Pressable
            onPress={onOpenTag}
            style={[
              styles.selectorButton,
              { backgroundColor: theme.colors.background.light },
            ]}
          >
            <Text
              size="md"
              weight="semibold"
              style={{ color: theme.colors.text.default }}
            >
              Add content warning
            </Text>
          </Pressable>
        )}
      </AnnotateToggle>
    </>
  );
}
