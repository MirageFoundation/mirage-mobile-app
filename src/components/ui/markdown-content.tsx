import { Markdown, type RenderRules, type StyleMap } from "@docren/react-native-markdown";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { memo, useCallback, useMemo } from "react";
import { useUnistyles } from "react-native-unistyles";

// Regex to match plain URLs (excluding trailing punctuation that might be markdown syntax)
const PLAIN_URL_REGEX = /https?:\/\/[^\s<>"]+/g;

// Regex to detect markdown links: [text](url) or ![alt](url)
const MARKDOWN_LINK_REGEX = /!?\[[^\]]*\]\([^)]+\)/g;

// Convert plain URLs to markdown links
function autoLinkUrls(content: string): string {
  // First, find all existing markdown links and their positions
  const markdownLinks: { start: number; end: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_LINK_REGEX.exec(content)) !== null) {
    markdownLinks.push({ start: match.index, end: match.index + match[0].length });
  }

  // Replace plain URLs only if they're not inside an existing markdown link
  return content.replace(PLAIN_URL_REGEX, (url, offset) => {
    const isInsideMarkdownLink = markdownLinks.some(link => offset >= link.start && offset < link.end);
    if (isInsideMarkdownLink) return url;
    return `[${url}](${url})`;
  });
}

type MarkdownContentProps = {
 content: string;
 onLinkPress?: (url: string) => void;
};

export const MarkdownContent = memo(function MarkdownContent({
  content,
  onLinkPress,
}: MarkdownContentProps) {
  const { theme } = useUnistyles();

 const handleLinkPress = useCallback(
   (url: string) => {
     if (onLinkPress) {
       onLinkPress(url);
        return true;
     }
     const fullUrl =
       url.startsWith("http://") || url.startsWith("https://")
         ? url
         : `https://${url}`;
      Linking.openURL(fullUrl).catch(() => {});
      return true;
   },
   [onLinkPress],
 );

  const markdownStyles = useMemo<StyleMap>(
    () => ({
     root: {
       fontFamily: theme.typography.family.mono,
       fontSize: theme.typography.size.md,
       lineHeight: theme.typography.size.md * theme.typography.leading.normal,
     },
     heading1: {
        color: theme.colors.text.default,
       fontSize: theme.typography.size.xxl,
        fontWeight: theme.typography.weight.bold,
        lineHeight: theme.typography.size.xxl * theme.typography.leading.tight,
        marginBottom: theme.spacing.sm,
      },
     heading2: {
        color: theme.colors.text.default,
       fontSize: theme.typography.size.xl,
        fontWeight: theme.typography.weight.bold,
        lineHeight: theme.typography.size.xl * theme.typography.leading.tight,
        marginBottom: theme.spacing.sm,
      },
     heading3: {
        color: theme.colors.text.default,
       fontSize: theme.typography.size.lg,
        fontWeight: theme.typography.weight.bold,
        lineHeight: theme.typography.size.lg * theme.typography.leading.tight,
        marginBottom: theme.spacing.xs,
      },
     heading4: {
        color: theme.colors.text.default,
       fontSize: theme.typography.size.md,
        fontWeight: theme.typography.weight.bold,
        marginBottom: theme.spacing.xs,
      },
     heading5: {
        color: theme.colors.text.default,
       fontSize: theme.typography.size.sm,
        fontWeight: theme.typography.weight.bold,
        marginBottom: theme.spacing.xs,
      },
     heading6: {
        color: theme.colors.text.default,
       fontSize: theme.typography.size.xs,
        fontWeight: theme.typography.weight.bold,
        marginBottom: theme.spacing.xs,
      },
     paragraph: {
       marginBottom: theme.spacing.xs,
        color: theme.colors.text.default,
     },
      text: {
        color: theme.colors.text.default,
      },
     link: {
        color: "#3B82F6",
        textDecorationLine: "underline",
      },
     strong: {
       fontWeight: theme.typography.weight.bold,
        color: theme.colors.text.default,
     },
     emphasis: {
       fontStyle: "italic",
        color: theme.colors.text.default,
     },
     code: {
       backgroundColor: theme.colors.background.subtle,
       borderRadius: theme.radius.sm,
       paddingHorizontal: 4,
       paddingVertical: 2,
       fontFamily: theme.typography.family.mono,
       fontSize: theme.typography.size.sm,
        color: theme.colors.text.default,
     },
     inlineCode: {
       backgroundColor: theme.colors.background.subtle,
       borderRadius: theme.radius.sm,
       paddingHorizontal: 4,
       paddingVertical: 2,
       fontFamily: theme.typography.family.mono,
       fontSize: theme.typography.size.sm,
        color: theme.colors.text.default,
     },
      blockquote: {
        borderLeftWidth: 3,
        borderLeftColor: theme.colors.border.subtle,
        paddingLeft: theme.spacing.sm,
        marginVertical: theme.spacing.xs,
        opacity: 0.8,
      },
      listItem: {
        flexDirection: "row",
        alignItems: "flex-start",
        marginBottom: theme.spacing.xs,
      },
      listBullet: {
        color: theme.colors.text.subtle,
        fontSize: theme.typography.size.md,
        lineHeight: theme.typography.size.md * theme.typography.leading.normal,
        marginRight: theme.spacing.xs,
      },
      listItemContent: {
        flex: 1,
        flexWrap: "wrap",
      },
      list: {
        marginVertical: theme.spacing.xs,
      },
      image: {
        borderRadius: theme.radius.md,
      },
      thematicBreak: {
        backgroundColor: theme.colors.border.subtle,
        height: 1,
        marginVertical: theme.spacing.sm,
      },
    }),
    [theme],
  );

  const renderRules = useMemo<RenderRules>(
    () => ({
      image: ({ node }) => (
        <Image
          key={(node as any).key}
          source={{ uri: node.url }}
          alt={node.alt ?? ""}
          style={{
            width: "100%",
            height: 200,
            borderRadius: theme.radius.md,
            marginVertical: theme.spacing.xs,
          }}
          contentFit="cover"
          transition={200}
        />
      ),
    }),
    [theme],
  );

  // Preprocess content to auto-link plain URLs
  const processedContent = useMemo(() => autoLinkUrls(content), [content]);

 return (
  <Markdown
     markdown={processedContent}
    styles={markdownStyles}
     mergeStyle={false}
    renderRules={renderRules}
    onLinkPress={handleLinkPress}
  />
 );
});
