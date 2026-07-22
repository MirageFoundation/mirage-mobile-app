// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  buildUsernameResolutionCandidates,
  selectUsernameResolution,
} from "../src/api/read/username-resolution";

const response = (username: string, address: string | null) => ({
  exists: address !== null,
  address,
  username,
});

describe("username resolution", () => {
  test("builds bare and anon candidates in deterministic order", () => {
    expect(buildUsernameResolutionCandidates("alice")).toEqual([
      "alice",
      "anon-alice",
    ]);
  });

  test("does not duplicate the anon prefix", () => {
    expect(buildUsernameResolutionCandidates("anon-alice")).toEqual([
      "anon-alice",
    ]);
  });

  test("normalizes casing and whitespace", () => {
    expect(buildUsernameResolutionCandidates("  Alice  ")).toEqual([
      "alice",
      "anon-alice",
    ]);
  });

  test("selects a bare username hit", () => {
    const candidates = ["alice", "anon-alice"];
    expect(
      selectUsernameResolution(candidates, [
        response("alice", "bare-address"),
        response("anon-alice", null),
      ]),
    ).toEqual(response("alice", "bare-address"));
  });

  test("falls back to an anon username hit", () => {
    const candidates = ["alice", "anon-alice"];
    expect(
      selectUsernameResolution(candidates, [
        response("alice", null),
        response("anon-alice", "anon-address"),
      ]),
    ).toEqual(response("anon-alice", "anon-address"));
  });

  test("returns a canonical miss when neither candidate exists", () => {
    expect(
      selectUsernameResolution(["alice", "anon-alice"], [
        response("alice", null),
        response("anon-alice", null),
      ]),
    ).toEqual(response("alice", null));
  });

  test("prefers the bare username deterministically when both exist", () => {
    const candidates = ["alice", "anon-alice"];
    expect(
      selectUsernameResolution(candidates, [
        response("alice", "bare-address"),
        response("anon-alice", "anon-address"),
      ]),
    ).toEqual(response("alice", "bare-address"));
  });
});
