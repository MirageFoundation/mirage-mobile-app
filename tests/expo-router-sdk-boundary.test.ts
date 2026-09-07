// @ts-nocheck -- Bun test/React DOM server types are not project dependencies.
import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FocusedRouteKeyContext, useIsFocused } from "expo-router/build/react-navigation/core/useIsFocused";
import { NavigationProvider } from "expo-router/build/react-navigation/core/NavigationProvider";

// SDK 56 bundles its own navigation contexts. TypeScript still resolves the old
// package, but Metro rejects application imports from it before the app boots.
test("application navigation has no SDK 56 forbidden React Navigation imports", () => {
  function check(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) check(path);
      else if (/\.[jt]sx?$/.test(path)) {
        expect(readFileSync(path, "utf8"), path).not.toMatch(/(?:from\s*|import\s*\(|require\s*\()["']@react-navigation\//);
      }
    }
  }
  check(join(import.meta.dir, "../src/navigation"));
  const source = readFileSync(join(import.meta.dir, "../src/navigation/protected-entry.tsx"), "utf8");
  expect(source).toMatch(/import\s*\{[^}]*useIsFocused[^}]*\}\s*from\s*"expo-router"/);
});

test("installed Expo Router focus hook uses its actual screen-layout provider and parent focus", () => {
  function Probe() {
    return createElement("span", null, useIsFocused() ? "focused" : "hidden");
  }
  const navigation = { isFocused: () => true, addListener: () => () => {} };
  function screen(key: string, children: ReturnType<typeof createElement>) {
    return createElement(NavigationProvider, {
      route: { key, name: key }, navigation: navigation as never, children,
    });
  }
  const focused = createElement(FocusedRouteKeyContext.Provider, { value: "settings" }, screen("settings", createElement(Probe)));
  expect(renderToStaticMarkup(focused)).toBe("<span>focused</span>");
  const behindModal = createElement(FocusedRouteKeyContext.Provider, { value: "login" }, screen("settings", createElement(Probe)));
  expect(renderToStaticMarkup(behindModal)).toBe("<span>hidden</span>");
  const inactiveTabs = createElement(FocusedRouteKeyContext.Provider, { value: "login" },
    screen("tabs", createElement(FocusedRouteKeyContext.Provider, { value: "inbox" }, screen("inbox", createElement(Probe)))));
  expect(renderToStaticMarkup(inactiveTabs)).toBe("<span>hidden</span>");
});
