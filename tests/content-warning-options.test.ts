// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  clearContentWarningSelection,
  CONTENT_WARNING_IDS,
  CONTENT_WARNING_OPTIONS,
  getSingleContentWarningSelection,
  selectSingleContentWarning,
} from "../src/domain/content";
import { getAnnotateContentWarningSelection } from "../src/pages/annotate/content-warning-selection";
import { getCreateContentWarningSelection } from "../src/pages/create/content-warning-selection";

describe("content warning options", () => {
  test("keeps canonical IDs and presentation metadata in product order", () => {
    expect(CONTENT_WARNING_IDS).toEqual([
      "sensitive",
      "adult",
      "violence",
      "gore",
      "death",
    ]);
    expect(CONTENT_WARNING_OPTIONS.map((option) => option.id)).toEqual(
      CONTENT_WARNING_IDS,
    );
    expect(
      CONTENT_WARNING_OPTIONS.every(
        (option) =>
          option.label &&
          option.description &&
          option.filterIcon &&
          option.badgeIcon,
      ),
    ).toBe(true);
  });

  test("maps single selection and explicit clear without toggling off a radio", () => {
    expect(getSingleContentWarningSelection("adult")).toEqual(["adult"]);
    expect(getSingleContentWarningSelection("")).toEqual([]);
    expect(getSingleContentWarningSelection("unknown")).toEqual([]);
    expect(selectSingleContentWarning(["adult"], "adult")).toEqual(["adult"]);
    expect(selectSingleContentWarning(["adult"], "gore")).toEqual(["gore"]);
    expect(clearContentWarningSelection()).toEqual([]);
  });

  test("keeps create and annotate adapter mapping equivalent", () => {
    for (const value of ["", ...CONTENT_WARNING_IDS]) {
      expect(getCreateContentWarningSelection(value)).toEqual(
        getAnnotateContentWarningSelection(value),
      );
    }
  });
});
