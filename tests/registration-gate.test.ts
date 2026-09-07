// @ts-nocheck -- Bun supplies test types.
import { expect, test } from "bun:test";
import { canSubmitRegistration } from "../src/domain/auth/registration-gate";

const successful = { isSuccess: true, isFetching: false, data: { exists: false } };
const ready = { registrationEnabled: true, requestedUsername: "fixture", currentUsername: "fixture", sameServer: true, results: [successful, successful] };

test("registration needs explicit enabled config and a successful current matching availability result", () => {
  expect(canSubmitRegistration(ready)).toBe(true);
  for (const registrationEnabled of [false, undefined, null, "true", 1]) {
    expect(canSubmitRegistration({ ...ready, registrationEnabled })).toBe(false);
  }
  expect(canSubmitRegistration({ ...ready, currentUsername: "changed" })).toBe(false);
  expect(canSubmitRegistration({ ...ready, requestedUsername: "", currentUsername: "" })).toBe(false);
  expect(canSubmitRegistration({ ...ready, sameServer: false })).toBe(false);
  expect(canSubmitRegistration({ ...ready, results: [] })).toBe(false);
  for (const failed of [
    { ...successful, isFetching: true },
    { ...successful, isSuccess: false },
    { ...successful, data: undefined },
    { ...successful, data: { exists: true } },
  ]) {
    expect(canSubmitRegistration({ ...ready, results: [successful, failed] })).toBe(false);
  }
});
