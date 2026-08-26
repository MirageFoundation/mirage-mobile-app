import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Text } from "@/src/components/ui/primitives";
import { fetchLinkMeta, type LinkMeta } from "@/src/utils/fetch-link-meta";

type LinkPreviewCardProps = {
  url: string;
};

export function LinkPreviewCard({ url }: LinkPreviewCardProps) {
  const { theme } = useUnistyles();
  const [meta, setMeta] = useState<LinkMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(true);
    setMeta(null);
    setImageError(false);
    debounceRef.current = setTimeout(async () => {
      const result = await fetchLinkMeta(url);
      setMeta(result);
      setLoading(false);
    }, 750);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [url]);

  if (loading) {
    return (
      <View style={[styles.container, { borderColor: theme.colors.border.default }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={theme.colors.text.subtle} />
          <Text size="sm" mode="subtle" style={{ marginLeft: 8 }}>
            Loading preview…
          </Text>
        </View>
      </View>
    );
  }

  if (!meta || (!meta.title && !meta.description && !meta.image)) {
    return null;
  }

  return (
    <View style={[styles.container, { borderColor: theme.colors.border.default, backgroundColor: theme.colors.background.subtle }]}>
      {meta.image && !imageError && (
        <Image
          source={{ uri: meta.image }}
          style={styles.image}
          contentFit="cover"
          cachePolicy="memory-disk"
          onError={() => setImageError(true)}
        />
      )}
      <View style={styles.content}>
        {meta.title && (
          <Text size="sm" weight="semibold" numberOfLines={2}>
            {meta.title}
          </Text>
        )}
        {meta.description && (
          <Text size="xs" mode="subtle" numberOfLines={2} style={{ marginTop: 2 }}>
            {meta.description}
          </Text>
        )}
        <View style={styles.domainRow}>
          <Feather name="globe" size={12} color={theme.colors.text.subtle} />
          <Text size="xs" mode="subtle" style={{ marginLeft: 4 }}>
            {meta.siteName ?? meta.domain}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    overflow: "hidden",
    marginTop: theme.spacing.sm,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.md,
  },
  image: {
    width: "100%",
    height: 160,
  },
  content: {
    padding: theme.spacing.sm,
  },
  domainRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: theme.spacing.xs,
  },
}));
