// @ts-nocheck -- Bun's test types are runtime-provided.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("src/components/molecules/post-card.tsx");
const ast = ts.createSourceFile("post-card.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let jsx;
function visit(node) {
  if (ts.isReturnStatement(node) && node.expression?.getText(ast).includes("<PostCardHeader")) {
    jsx = node.expression.getText(ast);
    return;
  }
  ts.forEachChild(node, visit);
}
visit(ast);
const compiled = ts.transpileModule(jsx, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, alwaysStrict: false } }).outputText;
function renderDetail(media, bodyText, shouldBlurContent = false) {
  const scope = {
    React: { createElement: (type, props, ...children) => ({ type, props, children }) },
    Pressable: "Pressable", View: "View", PostCardHeader: "author", PostCardContent: "title", PostCardMedia: "media", PostActions: "actions", MarkdownContent: "body", MediaPreviewModal: "preview",
    styles: {}, post: { id: "p", community: "news" }, author: { id: "a", username: "alice" }, title: "Full title ".repeat(50),
    resolvedContent: {}, optimisticResolvedMedia: media, bodyText, shouldBlurContent, isPostDetail: true,
  };
  const tree = new Function("scope", `with(scope) { return ${compiled} }`)(new Proxy(scope, { has: () => true, get: (target, key) => key === Symbol.unscopables ? undefined : target[key] }));
  const nodes = [];
  function walk(node) { if (!node || typeof node !== "object") return; nodes.push(node); node.children?.forEach(walk); }
  walk(tree);
  return nodes;
}

describe("unified post detail render contract", () => {
  for (const media of [undefined, { uri: "image.jpg", type: "image" }, { uri: "video.mp4", type: "video" }]) {
    test(`author/full title/inline media/actions/full markdown: ${media?.type ?? "text"}`, () => {
      const body = "**Full markdown**\n".repeat(400);
      const nodes = renderDetail(media, body);
      expect(nodes.filter((node) => ["author", "title", "media", "actions", "body"].includes(node.type)).map((node) => node.type)).toEqual(media ? ["author", "title", "media", "actions", "body"] : ["author", "title", "actions", "body"]);
      expect(nodes.find((node) => node.type === "body").props.content).toBe(body);
      expect(nodes.find((node) => node.type === "title").props.title.length).toBeGreaterThan(400);
    });
  }
  test("sensitive body stays gated and empty body produces no text child", () => {
    expect(renderDetail(undefined, "secret", true).some((node) => node.type === "body")).toBe(false);
    expect(renderDetail(undefined, "").some((node) => node.type === "body")).toBe(false);
  });
  test("one vertical list owns the stable element header and comment scrolling", () => {
    const page = read("src/pages/post/post-detail-content.tsx");
    const sections = read("src/pages/post/post-detail-sections.tsx");
    const list = read("src/pages/post/post-detail-comments-section.tsx");
    expect(page).not.toMatch(/MediaPostDetailScreen|useImmersive|useSharedValue|withTiming/);
    expect(sections).toContain("const listHeader = (");
    expect(sections.indexOf("<PostDetailPostSection")).toBeLessThan(sections.indexOf("<PostCommentsHeading"));
    expect(list).toContain("ListHeaderComponent={listHeader}");
    expect(list).toContain("initialNumToRender={5}");
    expect(sections).not.toMatch(/ScrollView|Animated|StickySummary/);
    expect(sections).toContain("getThreadReplyPolicy(");
    expect(sections).toContain("replyPolicy.notice");
  });
});
