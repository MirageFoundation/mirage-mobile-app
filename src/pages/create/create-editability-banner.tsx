import { View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";

type Editability = {
  allowed: boolean;
  limitMinutes: number;
  remainingMinutes: number;
};

type CreateEditabilityBannerProps = {
  isEditMode: boolean;
  editability: Editability | null;
};

export function CreateEditabilityBanner({
  isEditMode,
  editability,
}: CreateEditabilityBannerProps) {
  const { theme } = useUnistyles();

  if (!isEditMode || !editability) return null;

  if (!editability.allowed) {
    return (
      <View
        style={{
          marginHorizontal: 16,
          marginVertical: 8,
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: theme.colors.error[500] + "20",
          borderRadius: 10,
        }}
      >
        <Text size="sm" style={{ color: theme.colors.error[500] }}>
          Editing time has expired. Your tier allows editing up to {editability.limitMinutes} minutes after publishing.
        </Text>
      </View>
    );
  }

  if (editability.remainingMinutes === Infinity) return null;

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginVertical: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: theme.colors.warning[500] + "15",
        borderRadius: 10,
      }}
    >
      <Text size="sm" style={{ color: theme.colors.warning[500] }}>
        {editability.remainingMinutes} min remaining to edit this post
      </Text>
    </View>
  );
}
