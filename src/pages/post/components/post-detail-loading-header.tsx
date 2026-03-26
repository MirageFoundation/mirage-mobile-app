import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { Box } from "@/src/components/ui/primitives";

type PostDetailLoadingHeaderProps = {
  backgroundColor: string;
  onLayout: () => void;
};

export function PostDetailLoadingHeader({
  backgroundColor,
  onLayout,
}: PostDetailLoadingHeaderProps) {
  return (
    <View onLayout={onLayout}>
      <Box p="md">
        <View style={styles.skeletonHeader}>
          <View
            style={[
              styles.skeletonAvatar,
              { backgroundColor },
            ]}
          />
          <View style={styles.skeletonHeaderText}>
            <View
              style={[
                styles.skeletonLine,
                {
                  width: 120,
                  backgroundColor,
                },
              ]}
            />
            <View
              style={[
                styles.skeletonLine,
                {
                  width: 80,
                  backgroundColor,
                },
              ]}
            />
          </View>
        </View>
        <View
          style={[
            styles.skeletonLine,
            {
              width: "100%",
              height: 20,
              marginTop: 12,
              backgroundColor,
            },
          ]}
        />
        <View
          style={[
            styles.skeletonLine,
            {
              width: "90%",
              height: 20,
              marginTop: 8,
              backgroundColor,
            },
          ]}
        />
        <View
          style={[
            styles.skeletonLine,
            {
              width: "100%",
              height: 100,
              marginTop: 12,
              backgroundColor,
            },
          ]}
        />
      </Box>
      <View style={[styles.divider, { backgroundColor }]} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  divider: {
    height: 5,
  },
  skeletonHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  skeletonHeaderText: {
    marginLeft: theme.spacing.sm,
    gap: 4,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
  },
}));
