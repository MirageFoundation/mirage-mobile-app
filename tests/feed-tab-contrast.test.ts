// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { getTabLabelColors } from "../src/components/molecules/tab-label-colors";
import { darkTheme, lightTheme } from "../src/config/theme";

describe("feed tab label contrast tokens", () => {
  test("inactive Following/Topics labels use the subtle text token in both themes", () => {
    expect(getTabLabelColors(darkTheme.colors.text)).toEqual({
      activeColor: darkTheme.colors.text.default,
      inactiveColor: darkTheme.colors.text.subtle,
    });
    expect(getTabLabelColors(lightTheme.colors.text)).toEqual({
      activeColor: lightTheme.colors.text.default,
      inactiveColor: lightTheme.colors.text.subtle,
    });
    expect(darkTheme.colors.text.subtle).not.toBe(darkTheme.colors.text.default);
    expect(darkTheme.colors.text.subtle).toBeTruthy();
  });
});
