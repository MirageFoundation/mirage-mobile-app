// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { getVoteColor } from "../src/components/atoms/vote-button-state";

const colors = {
  inactive: "subtle",
  like: "success",
  dislike: "error",
};

describe("vote button color state", () => {
  test("uses the inactive color for either unselected vote type", () => {
    expect(getVoteColor("like", false, colors)).toBe("subtle");
    expect(getVoteColor("dislike", false, colors)).toBe("subtle");
  });

  test("maps selected vote types to their semantic colors", () => {
    expect(getVoteColor("like", true, colors)).toBe("success");
    expect(getVoteColor("dislike", true, colors)).toBe("error");
  });
});
