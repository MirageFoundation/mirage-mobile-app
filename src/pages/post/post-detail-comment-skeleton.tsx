import { View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { styles } from "./post-detail-styles";

type PostDetailCommentSkeletonProps = {
  depth?: number;
};

export function PostDetailCommentSkeleton({ depth = 0 }: PostDetailCommentSkeletonProps) {
  const { theme } = useUnistyles();
  const indentWidth = depth * 16;
  const skeletonColor = theme.colors.background.subtle;

  return (
    <View style={[styles.commentSkeleton, { marginLeft: indentWidth }]}>
      <View style={styles.skeletonHeader}>
        <View
          style={[
            styles.skeletonAvatar,
            {
              width: 32,
              height: 32,
              backgroundColor: skeletonColor,
            },
          ]}
        />
        <View style={styles.skeletonHeaderText}>
          <View
            style={[
              styles.skeletonLine,
              {
                width: 100,
                height: 10,
                backgroundColor: skeletonColor,
              },
            ]}
          />
        </View>
      </View>

      <View style={{ marginTop: 8, gap: 6 }}>
        <View
          style={[
            styles.skeletonLine,
            {
              width: "100%",
              height: 12,
              backgroundColor: skeletonColor,
            },
          ]}
        />
        <View
          style={[
            styles.skeletonLine,
            {
              width: "85%",
              height: 12,
              backgroundColor: skeletonColor,
            },
          ]}
        />
        <View
          style={[
            styles.skeletonLine,
            {
              width: "60%",
              height: 12,
              backgroundColor: skeletonColor,
            },
          ]}
        />
      </View>

      <View style={styles.skeletonActions}>
        <View
          style={[
            styles.skeletonLine,
            {
              width: 24,
              height: 10,
              backgroundColor: skeletonColor,
            },
          ]}
        />
        <View
          style={[
            styles.skeletonLine,
            {
              width: 24,
              height: 10,
              backgroundColor: skeletonColor,
            },
          ]}
        />
        <View
          style={[
            styles.skeletonLine,
            {
              width: 24,
              height: 10,
              backgroundColor: skeletonColor,
            },
          ]}
        />
      </View>
    </View>
  );
}
