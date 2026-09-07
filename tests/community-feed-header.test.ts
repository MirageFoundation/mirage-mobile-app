// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const theme = {
  colors: { background: { default: "white" }, text: { default: "black", subtle: "gray" }, border: { default: "gray", subtle: "gray" }, primary: { 500: "blue" }, contrast: { base: "black" } },
  radius: { lg: 12, full: 99 }, spacing: { xs: 4, sm: 8, md: 16 },
};
const createElement = (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter((child) => child !== false && child != null) });
function load(path, extra = {}) {
  const compiled = ts.transpileModule(source(path), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mocks = {
    "react/jsx-runtime": { jsx: (type, props) => createElement(type, props, props?.children), jsxs: (type, props) => createElement(type, props, props?.children), Fragment: "Fragment" },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "react-native": { View: "View", Pressable: "Pressable", ScrollView: "ScrollView" },
    "react-native-popup-menu": { Menu: "Menu", MenuTrigger: "MenuTrigger", MenuOption: "MenuOption", MenuOptions: "MenuOptions" },
    "react-native-unistyles": { useUnistyles: () => ({ theme }), StyleSheet: { create: (fn) => fn(theme) } },
    "@/src/components/ui/primitives": { Text: "Text" },
    "@/src/domain/communities": { communityLabel: (name) => `[${name}]` },
    "./community-feed-styles": { styles: loadStyles() },
    ...extra,
  };
  const exports = {};
  new Function("require", "exports", compiled)((id) => {
    if (!(id in mocks)) throw new Error(`Missing mock ${id}`);
    return mocks[id];
  }, exports);
  return exports;
}
function loadStyles() {
  const compiled = ts.transpileModule(source("src/pages/community/community-feed-styles.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)(() => ({ StyleSheet: { create: (fn) => fn(theme) } }), exports);
  return exports.styles;
}
function nodes(tree, type) {
  if (!tree || typeof tree !== "object") return [];
  return [...(tree.type === type ? [tree] : []), ...tree.children.flatMap((child) => nodes(child, type))];
}
const text = (tree) => typeof tree === "string" ? tree : tree?.children?.map(text).join("") ?? "";

describe("compact community header", () => {
  for (const isJoined of [false, true]) {
    test(`only back, readable title, membership and overflow are inline (joined=${isJoined})`, () => {
      const calls = [];
      const { CommunityFeedHeader } = load("src/pages/community/community-feed-header.tsx", {
        "./community-feed-menu": { CommunityFeedMenu: "CommunityFeedMenu" },
      });
      const tree = CommunityFeedHeader({ communityName: "comics", insetsTop: 24, isJoined, onBack: () => calls.push("back"), onJoinToggle: () => calls.push("join") });
      expect(tree.children.map((child) => child.type)).toEqual(["Pressable", "Text", "Pressable", "CommunityFeedMenu"]);
      expect(text(tree.children[1])).toBe("[comics]");
      expect(tree.children[1].props.style).toMatchObject({ flex: 1, minWidth: 0 });
      expect(tree.children[1].props).toMatchObject({ numberOfLines: 1, ellipsizeMode: "tail", accessibilityLabel: "[comics]" });
      expect(text(tree.children[2])).toBe(isJoined ? "Joined" : "Join");
      expect(tree.props.style[1].paddingTop).toBe(24);
      nodes(tree, "Pressable").forEach((node) => node.props.onPress());
      expect(calls).toEqual(["back", "join"]);
      expect(loadStyles().backButton).toMatchObject({ width: 44, height: 44, flexShrink: 0 });
      expect(tree.children[1].props).toMatchObject({ size: "xl", weight: "bold" });
      expect(tree.children[2].props.style).toMatchObject({ minHeight: 44, minWidth: 44, flexShrink: 0 });
      expect(tree.children[2].props.style.backgroundColor).toBeUndefined();
      expect(tree.children[2].children[0].props.style[0]).toMatchObject({ minHeight: 30 });
      expect(loadStyles().headerContainer.paddingBottom).toBe(4);
      expect(source("src/pages/community/community-feed-content.tsx")).toContain("const HEADER_HEIGHT = 48;");
    });
  }

  test("overflow preserves sort, lens, teams and density in a single menu", () => {
    let section = "main";
    const calls = [];
    const props = {
      sortBy: "magic", sortOptions: [{ label: "Best", value: "magic" }, { label: "New", value: "newest" }],
      lensChoice: { lens: "team", team_id: 7 }, teamOptions: [{ teamId: 7, label: "Team Seven" }],
      onSortChange: (value) => calls.push(value), onLensChange: (value) => calls.push(value), onTeamsPress: () => calls.push("teams"),
    };
    const { CommunityFeedMenu } = load("src/pages/community/community-feed-menu.tsx", {
      react: { useState: () => [section, (next) => { section = next; }] },
      "@/src/stores": { useFeedDensity: () => ["compact"] },
      "@/src/components/molecules/feed-density-toggle": { FeedDensityOptions: "FeedDensityOptions" },
      "./community-lens-picker": { CommunityLensOptions: "CommunityLensOptions", lensChoiceLabel: () => "Team Seven" },
    });
    const render = () => CommunityFeedMenu(props);
    const main = render();
    expect(nodes(main, "Icon")[0].props.name).toBe("ellipsis-vertical");
    expect(nodes(main, "MenuTrigger")[0].props.customStyles.triggerTouchable.accessibilityLabel).toBe("Community options");
    expect(nodes(main, "MenuOption").map(text)).toEqual(["Sort: Best", "Lens: Team Seven", "Community teams", "View: Compact"]);
    const options = nodes(main, "MenuOption");
    expect(options[0].props.onSelect()).toBe(false);
    const sort = render();
    expect(nodes(sort, "Menu")).toHaveLength(1);
    expect(nodes(sort, "MenuOption")[1].props.customStyles.optionTouchable.accessibilityState.checked).toBe(true);
    nodes(sort, "MenuOption")[2].props.onSelect();
    expect(calls).toEqual(["newest"]);
    sort.props.onClose();
    expect(section).toBe("main");
    expect(options[1].props.onSelect()).toBe(false);
    const lens = nodes(render(), "CommunityLensOptions")[0];
    expect(lens.props).toMatchObject({ choice: props.lensChoice, teamOptions: props.teamOptions, onSelect: props.onLensChange });
    lens.props.onSelect({ lens: "raw", team_id: null });
    options[2].props.onSelect();
    expect(calls).toEqual(["newest", { lens: "raw", team_id: null }, "teams"]);
    expect(options[3].props.onSelect()).toBe(false);
    expect(nodes(render(), "FeedDensityOptions")).toHaveLength(1);
    nodes(render(), "MenuOption")[0].props.onSelect();
    expect(section).toBe("main");
  });
  test("community sorts match web Best/New labels without changing wire values or default", () => {
    const content = source("src/pages/community/community-feed-content.tsx");
    const controller = source("src/pages/community/use-community-feed-controller.ts");
    expect(content).toContain('{ label: "Best", value: "magic" as const }');
    expect(content).toContain('{ label: "New", value: "newest" as const }');
    expect(controller).toContain('useState<"magic" | "newest">("magic")');
    expect(controller).toContain("by: sortBy");
  });
});
