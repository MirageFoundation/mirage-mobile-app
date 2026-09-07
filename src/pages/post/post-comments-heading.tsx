import { Pressable, View } from "react-native";
import { Text } from "@/src/components/ui/primitives";
import type { PostCommentSort } from "./post-comment-sort";

export function PostCommentsHeading({ sort, onSort }: { sort: PostCommentSort; onSort: (sort: PostCommentSort) => void }) {
  return (
    <View style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 16 }}>
      <Text weight="semibold" style={{ flex: 1 }}>Comments</Text>
      {(["best", "new", "old"] as const).map((value) => (
        <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Sort comments by ${value}`} accessibilityState={{ selected: value === sort }} onPress={() => onSort(value)} hitSlop={8}>
          <Text size="sm" weight={value === sort ? "bold" : "regular"} mode={value === sort ? undefined : "subtle"}>{value === "best" ? "Best" : value === "new" ? "New" : "Old"}</Text>
        </Pressable>
      ))}
    </View>
  );
}
