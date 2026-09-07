// @ts-nocheck -- Bun runtime transpilation with native UI seams stubbed.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { communityLabel } from "../src/domain/communities";
import { recentSearchLabel, SEARCH_TABS, SEARCH_TAB_LABELS } from "../src/pages/search/search-state";

const element = (type, props, ...children) => ({ type, props: { ...props, children } });
const animation = { delay: () => animation, duration: () => animation, springify: () => animation };
const theme = { colors: { text: { default: "black", subtle: "gray" }, background: { default: "white", lighter: "white" }, border: { subtle: "gray" }, primary: { 500: "blue" } } };
const env = {
  React: { createElement: element },
  Ionicons: "Icon", ActivityIndicator: "Spinner", Pressable: "Pressable", TextInput: "Input",
  View: "View", FlatList: "List", ScrollView: "Scroll", GestureDetector: "Gesture",
  Box: "Box", Text: "Text", Avatar: "Avatar",
  Animated: { View: "AnimatedView" }, FadeInDown: animation, FadeIn: animation, FadeOut: animation, Layout: animation,
  useUnistyles: () => ({ theme }), useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
  useCallback: (fn) => fn,
  styles: {}, SCREEN_WIDTH: 390, communityLabel, recentSearchLabel, SEARCH_TABS, SEARCH_TAB_LABELS,
  getCommunityIcon: () => ({ icon: "chatbubble", color: "blue" }), formatPostCount: (count) => `${count} posts`,
  SearchPostResult: "Post", SearchRecentItem: "Recent", SearchResultsSections: "Results",
};
function load(file, name, extra = {}) {
  const source = readFileSync(new URL(`../src/pages/search/${file}`, import.meta.url), "utf8")
    .replace(/^import[\s\S]*?;\n/gm, "").replace(/\bexport\s+/g, "");
  const js = new Bun.Transpiler({ loader: "tsx", tsconfig: { compilerOptions: { jsx: "react" } } }).transformSync(source);
  const scope = { ...env, ...extra };
  return new Function(...Object.keys(scope), `${js}\nreturn ${name};`)(...Object.values(scope));
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  return text(tree.props?.children);
}

describe("search presentation runtime (native seams stubbed)", () => {
  test("screen renders Communities tab, placeholder, and accessible copy", () => {
    const Screen = load("search-content.tsx", "SearchScreen", { useSearchController: () => ({ showResults: true, activeTab: "communities", tabCounts: { posts: 0, communities: 2, users: 0 } }) });
    const tree = Screen();
    const tabs = nodes(tree).filter((node) => node.props.accessibilityRole === "tab");
    expect(tabs.map((node) => node.props.accessibilityLabel)).toEqual(["Posts", "Communities, 2", "Users"]);
    const input = nodes(tree).find((node) => node.type === "Input");
    expect(input.props.placeholder).toBe("Search posts, communities, users...");
    expect(input.props.accessibilityLabel).toBe("Search posts, communities, and users");
  });

  test("trending, selected, and result communities use bracket labels", () => {
    const item = { community: "bitcoin", post_count: 10 };
    let pressed;
    const Trending = load("search-results-sections.tsx", "TrendingTopicItem");
    const trending = Trending({ item, index: 0, onPress: (value) => { pressed = value; } });
    expect(text(trending)).toContain("[bitcoin]");
    const button = nodes(trending).find((node) => node.type === "Pressable");
    expect(button.props.accessibilityLabel).toBe("Open trending community bitcoin");
    button.props.onPress();
    expect(pressed).toBe(item);
    const Header = load("search-results-sections.tsx", "TopicPostsHeader");
    const header = Header({ controller: { selectedCommunity: item } });
    expect(text(header)).toBe("[bitcoin]");
    expect(nodes(header).find((node) => node.type === "Pressable").props.accessibilityLabel).toBe("Back to community results");
    const Sections = load("search-results-sections.tsx", "SearchResultsSections");
    const results = Sections({ bottomInset: 0, controller: { communityPosts: [], showResults: true, activeTab: "communities", searchResults: { communities: [item], posts: [], users: [] } } });
    const list = nodes(results).find((node) => node.type === "List");
    expect(text(list.props.renderItem({ item, index: 0 }))).toContain("[bitcoin]");
    const discovery = Sections({ bottomInset: 0, controller: { communityPosts: [], discoverySections: [{ key: "trending", items: [], isLoading: false }] } });
    expect(text(discovery)).toContain("TRENDING COMMUNITIES");
    expect(text(discovery)).toContain("No trending communities available");
  });

  test("recent display changes but selection and deletion retain original identity", () => {
    const Recent = load("search-recent-item.tsx", "SearchRecentItem");
    const item = { id: "old", query: "#Bitcoin", timestamp: 1 };
    let selected;
    let removed;
    const tree = Recent({ item, index: 0, textSubtleColor: "gray", onPress: (value) => { selected = value; }, onRemove: (id) => { removed = id; } });
    expect(text(tree)).toBe("[bitcoin]");
    const buttons = nodes(tree).filter((node) => node.type === "Pressable");
    expect(buttons.map((node) => node.props.accessibilityLabel)).toEqual(["Search [bitcoin]", "Remove recent search [bitcoin]"]);
    buttons[0].props.onPress();
    buttons[1].props.onPress();
    expect(selected).toBe(item);
    expect(selected.query).toBe("#Bitcoin");
    expect(removed).toBe("old");
  });
});
