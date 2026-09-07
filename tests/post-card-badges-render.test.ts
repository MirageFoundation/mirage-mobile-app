// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/components/molecules/post-card.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("post-card.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let badgesExpression;
function visit(node) {
  if (ts.isJsxExpression(node) && node.expression?.getText(ast).includes("<View style={styles.badgesRow}>")) {
    badgesExpression = node.expression.getText(ast);
    return;
  }
  ts.forEachChild(node, visit);
}
visit(ast);
if (!badgesExpression) throw new Error("PostCard badges JSX expression not found");

// Execute the actual JSX branch, without loading unrelated native media hooks.
const compiled = ts.transpileModule(`const render = (contentWarnings, post) => (${badgesExpression});`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const createElement = (type, props, ...children) => ({ type, props, children });
const render = new Function("React", "View", "ContentWarningBadge", "AwardBadges", "styles", `${compiled}; return render;`)(
  { createElement }, "View", "ContentWarningBadge", "AwardBadges", { badgesRow: "row", awardsPill: "pill" },
);

describe("post-card badges native child safety", () => {
  for (const warnings of [undefined, []]) {
    for (const awards of [undefined, []]) {
      test(`empty badges render no raw text: warnings=${JSON.stringify(warnings)}, awards=${JSON.stringify(awards)}`, () => {
        expect(render(warnings, { awards })).toBe(false);
      });
    }
  }
  for (const [warnings, awards, expected] of [
    [["sensitive"], [], ["ContentWarningBadge"]],
    [[], [{ type: "gold" }], ["View"]],
    [["sensitive"], [{ type: "gold" }], ["ContentWarningBadge", "View"]],
  ]) {
    test(`nonempty badges preserve ${expected.join(" and ")}`, () => {
      const row = render(warnings, { awards });
      expect(row.type).toBe("View");
      expect(row.children.filter(Boolean).map((child) => child.type)).toEqual(expected);
      expect(row.children.some((child) => typeof child === "number" || typeof child === "string")).toBe(false);
    });
  }
});
