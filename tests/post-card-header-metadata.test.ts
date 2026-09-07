// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const subtleColor = "muted-text-token";
const usernameColor = "tier-color-token";
const theme = { colors: { text: { subtle: subtleColor } } };
const handleAuthorPress = () => {};
const handleCommunityPress = () => {};

function metadataRenderer(file, rowStyle) {
  const source = readFileSync(new URL(`../src/components/molecules/${file}`, import.meta.url), "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let row;
  let displayHelper = "";
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "getCommunityUsernameDisplay") {
      displayHelper = node.getText(ast);
    }
    if (ts.isJsxElement(node) && node.openingElement.getText(ast) === `<View style={styles.${rowStyle}}>` ) {
      row = node.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!row) throw new Error(`Metadata row not found in ${file}`);
  const compiled = ts.transpileModule(`
    const MAX_HEADER_LENGTH = 30;
    ${displayHelper}
    const render = (community, author, communityDisabled = false, disableInteractions = false) => {
      const createdAt = 1234;
      const { displayCommunity, showUsername } = ${displayHelper ? "getCommunityUsernameDisplay(community, author.username)" : "{}"};
      return (${row});
    };
  `, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(
    "React", "View", "Text", "Pressable", "TimeAgo", "styles", "theme",
    "subtleTextStyle", "usernameColorStyle", "usernameColor", "handleAuthorPress", "handleCommunityPress",
    `${compiled}; return render;`,
  )(
    { createElement: (type, props, ...children) => ({ type, props, children }) },
    "View", "Text", "Pressable", "TimeAgo", {}, theme,
    { color: subtleColor }, { color: usernameColor }, usernameColor, handleAuthorPress, handleCommunityPress,
  );
}

function visibleChildren(node) {
  return node.children.filter((child) => child !== false && child != null);
}

function assertNativeChildSafety(node) {
  for (const child of visibleChildren(node)) {
    if (typeof child === "string" || typeof child === "number") {
      expect(node.type).toBe("Text");
    } else {
      assertNativeChildSafety(child);
    }
  }
}

const standard = metadataRenderer("post-card-header.tsx", "authorRow");
const compact = metadataRenderer("post-card-compact.tsx", "metaRow");

describe("post-card metadata header", () => {
  for (const [name, render] of [["standard", standard], ["compact", compact]]) {
    for (const communityDisabled of [false, true]) {
      test(`${name}: muted small community, colored username, then timestamp (disabled=${communityDisabled})`, () => {
        const row = render("news", { username: "alice" }, communityDisabled);
        assertNativeChildSafety(row);
        const children = visibleChildren(row);
        expect(children.map((node) => node.type)).toEqual([
          name === "standard" && communityDisabled ? "Text" : "Pressable",
          "Text", "Pressable", "Text", "TimeAgo",
        ]);
        const community = children[0].type === "Text" ? children[0] : children[0].children[0];
        expect(community.children.join("")).toBe("[news]");
        expect(community.props).toMatchObject({
          size: "sm", weight: "medium", numberOfLines: 1, style: { color: subtleColor },
        });
        if (!communityDisabled) expect(children[0].props.onPress).toBe(handleCommunityPress);
        expect(children[2].props.onPress).toBe(handleAuthorPress);
        expect(children[2].children[0].children.join("")).toBe("@alice");
        expect(children[2].children[0].props).toMatchObject({
          size: name === "standard" ? "md" : "sm",
          numberOfLines: 1, style: { color: usernameColor },
        });
        expect(children[4].props).toMatchObject({
          timestamp: 1234, size: community.props.size, style: { color: subtleColor },
        });
      });
    }
    for (const community of [undefined, ""]) {
      test(`${name}: missing community has no leading separator or raw native children (${String(community)})`, () => {
        const row = render(community, { username: "alice" });
        assertNativeChildSafety(row);
        const children = visibleChildren(row);
        expect(children.map((node) => node.type)).toEqual(["Pressable", "Text", "TimeAgo"]);
        expect(children[0].children[0].children.join("")).toBe("@alice");
        expect(children[2].props.size).toBe("sm");
      });
    }
  }

  for (const communityDisabled of [false, true]) {
    test(`standard: long community retains truncation and timestamp (disabled=${communityDisabled})`, () => {
      const row = standard("a".repeat(40), { username: "alice" }, communityDisabled);
      assertNativeChildSafety(row);
      const children = visibleChildren(row);
      expect(children.map((node) => node.type)).toEqual([
        communityDisabled ? "Text" : "Pressable", "Text", "TimeAgo",
      ]);
      const community = communityDisabled ? children[0] : children[0].children[0];
      expect(community.children.join("")).toBe(`[${"a".repeat(28)}...]`);
      expect(children[2].props.size).toBe(community.props.size);
    });
  }
});
