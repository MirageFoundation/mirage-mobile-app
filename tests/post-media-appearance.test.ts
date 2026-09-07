// @ts-nocheck -- Bun test types and the native-free JSX harness are runtime-provided.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { fullscreenMediaColors } from "../src/components/molecules/post-actions-appearance";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const createElement = (type, props, ...children) => ({ type, props: props ?? {}, children });
const flatten = (style) => Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean));
const nodes = (node) => !node || typeof node !== "object" ? [] : [node, ...node.children.flat(Infinity).flatMap(nodes)];
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const themes = {
  light: { text: { default: "#18181B" }, border: { default: "#D4D4D8", subtle: "#E4E4E7" }, background: { default: "#fff" }, error: { 500: "#DC2626" }, contrast: { base: "#000" } },
  dark: { text: { default: "#FAFAFA" }, border: { default: "#52525B", subtle: "#27272A" }, background: { default: "#18181B" }, error: { 500: "#F87171" }, contrast: { base: "#fff" } },
};

function renderActions(colors, props = {}, loggedIn = true) {
  const theme = { colors, radius: { full: 99, lg: 12 }, spacing: { xs: 4, md: 16 } };
  const modules = {
    react: { memo: (fn) => fn, useRef: (value) => ({ current: value }) },
    "react-native": { View: "View", Pressable: "Pressable", Animated: { View: "Animated.View", Value: class {} } },
    "react-native-unistyles": { useUnistyles: () => ({ theme }), StyleSheet: { create: (fn) => fn(theme) } },
    "@/assets/figma-icons": Object.fromEntries(["CommentIcon", "DownvoteFilledIcon", "ShareIcon", "UpvoteFilledIcon"].map((name) => [name, name])),
    "@/src/components/ui/primitives": { Text: "Text" },
    "@/src/components/utils/haptics": {},
    "@/src/features/moderation/moderation-provider": { ModerationButton: "ModerationButton" },
    "@/src/providers/toast-provider": { useToast: () => ({}) },
    "@/src/stores": { useContentModerationStore: (select) => select({ hiddenPostIds: new Set() }), useAuthStore: (select) => select({ isLoggedIn: loggedIn }), useUIStore: (select) => select({ showAuthSheet() {} }) },
    "@expo/vector-icons": { Ionicons: "Ionicons" },
    "react-native-popup-menu": Object.fromEntries(["Menu", "MenuOption", "MenuOptions", "MenuTrigger"].map((name) => [name, name])),
    "./post-actions-appearance": { fullscreenMediaColors },
  };
  const exports = {};
  new Function("require", "exports", "React", compile(read("src/components/molecules/post-actions.tsx")))(
    (name) => { if (!(name in modules)) throw new Error(`Unexpected import: ${name}`); return modules[name]; }, exports, { createElement },
  );
  return nodes(exports.PostActions({ likes: 12, dislikes: 1, comments: 3, postId: "post", authorUsername: "alice", ...props }));
}

for (const [name, colors] of Object.entries(themes)) {
  describe(`${name} app theme`, () => {
    for (const appearance of [undefined, "default", "fullscreen"]) {
      test(`actions ${appearance ?? "omitted"}: foreground, pills, menu and destructive colors`, () => {
        const tree = renderActions(colors, { appearance });
        const fullscreen = appearance === "fullscreen";
        const foreground = fullscreen ? fullscreenMediaColors.text : colors.text.default;
        expect(tree.find((node) => node.type === "ShareIcon").props.color).toBe(foreground);
        expect(tree.find((node) => node.type === "CommentIcon").props.color).toBe(foreground);
        expect(tree.find((node) => node.type === "UpvoteFilledIcon").props.color).toBe(foreground);
        const pills = tree.filter((node) => flatten(node.props.style).borderRadius === 99);
        expect(pills.length).toBe(4);
        for (const pill of pills) {
          expect(flatten(pill.props.style).backgroundColor).toBe(fullscreen ? fullscreenMediaColors.surface : "transparent");
          expect(flatten(pill.props.style).borderColor).toBe(fullscreen ? fullscreenMediaColors.border : colors.border.default);
        }
        const menu = tree.find((node) => node.type === "MenuOptions").props.customStyles.optionsContainer;
        expect(menu.backgroundColor).toBe(fullscreen ? fullscreenMediaColors.surface : colors.background.default);
        expect(menu.borderColor).toBe(fullscreen ? fullscreenMediaColors.border : colors.border.subtle);
        expect(tree.find((node) => node.props.name === "ban-outline").props.color).toBe(fullscreen ? fullscreenMediaColors.destructive : colors.error[500]);
      });
    }
    test("fullscreen keeps selected votes, disabled opacity and read-only comment policy", () => {
      const tree = renderActions(colors, { appearance: "fullscreen", hasLiked: true, hasDisliked: true, disabled: true, hideCommentAction: true }, false);
      expect(tree.find((node) => node.type === "UpvoteFilledIcon").props.color).toBe("#22C55E");
      expect(tree.find((node) => node.type === "DownvoteFilledIcon").props.color).toBe("#EF4444");
      expect(tree.some((node) => node.type === "CommentIcon")).toBe(false);
      for (const button of tree.filter((node) => node.type === "Pressable")) {
        expect(button.props.disabled).toBe(true);
        expect(flatten(button.props.style).opacity).toBe(0.5);
      }
    });
  });
}

// Execute the page's actual returned JSX without loading its native media hooks.
const pageSource = read("src/pages/post/post-media-page.tsx");
const pageAst = ts.createSourceFile("page.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const pageFunction = pageAst.statements.find((node) => ts.isFunctionDeclaration(node));
const returned = pageFunction.body.statements.find((node) => ts.isReturnStatement(node)).expression.getText(pageAst);
function renderPage(overrides = {}) {
  const scope = {
    fullscreenMediaColors, insets: { top: 44, bottom: 34 }, media: [], selected: 0,
    gated: false, isLoading: false, displayPost: { author: { id: "alice", username: "alice" } },
    policy: { canReply: false, notice: "This older thread is read-only." }, saved: false,
    currentUser: undefined, id: "post", shareServer: "server", getShareBaseUrl: () => "https://example.com",
    actionSheetsRef: {}, data: undefined, followedUsers: [], followed: undefined,
    close() {}, showComments() {}, ...overrides,
  };
  for (const component of ["ModerationProvider", "GestureHandlerRootView", "View", "Pressable", "Text", "Ionicons", "FlatList", "ActivityIndicator", "PostActions", "PostDetailActionSheets"]) scope[component] = component;
  return nodes(new Function("React", ...Object.keys(scope), compile(`const render = () => (${returned});`) + "; return render();")({ createElement }, ...Object.values(scope)));
}

test("fullscreen footer, notice, save and safe area use fixed dark chrome", () => {
  for (const saved of [false, true]) {
    const tree = renderPage({ saved });
    expect(tree.find((node) => node.type === "GestureHandlerRootView").props.style).toMatchObject({ backgroundColor: "#000", paddingBottom: 34 });
    expect(tree.find((node) => node.props.style?.minHeight === 64).props.style.backgroundColor).toBe("#000");
    expect(tree.find((node) => node.type === "PostActions").props.appearance).toBe("fullscreen");
    expect(tree.find((node) => node.children.includes("This older thread is read-only.")).props.style.color).toBe(fullscreenMediaColors.subtleText);
    expect(tree.find((node) => node.props.name === (saved ? "bookmark" : "bookmark-outline")).props.color).toBe("#fff");
  }
});

test("loading, unavailable and sensitive-media states retain black safe area and white feedback", () => {
  for (const state of [{ isLoading: true }, {}, { gated: true }]) {
    const tree = renderPage({ displayPost: undefined, ...state });
    expect(tree.find((node) => node.type === "GestureHandlerRootView").props.style.backgroundColor).toBe("#000");
    const feedback = tree.find((node) => node.type === "ActivityIndicator" || node.children.includes("Media unavailable") || node.children.includes("Sensitive content - tap to reveal"));
    expect(feedback.props.color ?? feedback.props.style.color).toBe("#fff");
    expect(tree.some((node) => node.type === "PostActions")).toBe(false);
  }
  expect(pageSource).not.toContain("theme.colors");
});
