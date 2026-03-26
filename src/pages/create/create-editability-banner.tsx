import { View } from "react-native";

import { Text } from "@/src/components/ui/primitives";

type EditabilityInfo = {
  allowed: boolean;
  remainingMinutes: number;
  limitMinutes: number;
};

type CreateEditabilityBannerProps = {
  isEditMode: boolean;
  editability: EditabilityInfo | null;
  errorColor: string;
  warningColor: string;
};

export function CreateEditabilityBanner({
  isEditMode,
  editability,
  errorColor,
  warningColor,
}: CreateEditabilityBannerProps) {
  if (!isEditMode || !editability) {
    return null;
  }

  if (!editability.allowed) {
    return (
      <View
        style={{
          marginHorizontal: 16,
          marginVertical: 8,
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: `${errorColor}20`,
          borderRadius: 10,
        }}
      >
        <Text size="sm" style={{ color: errorColor }}>
          Editing time has expired. Your tier allows editing up to {editability.limitMinutes} minutes after publishing.
        </Text>
      </View>
    );
  }

  if (editability.remainingMinutes !== Infinity) {
    return (
      <View
        style={{
          marginHorizontal: 16,
          marginVertical: 8,
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: `${warningColor}15`,
          borderRadius: 10,
        }}
      >
        <Text size="sm" style={{ color: warningColor }}>
          {editability.remainingMinutes} min remaining to edit this post
        </Text>
      </View>
    );
  }

  return null;
}
