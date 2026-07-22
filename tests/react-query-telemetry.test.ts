// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  buildMutationErrorMetadata,
  buildQueryErrorMetadata,
  MAX_REACT_QUERY_METADATA_BYTES,
  sanitizedTelemetryError,
} from "../src/services/react-query-telemetry";

describe("React Query telemetry metadata", () => {
  test("keeps allowlisted operation metadata without mutation variables", () => {
    const variables = {
      token: "ExponentPushToken[secret]",
      wallet: { address: "wallet-secret", mnemonic: "word ".repeat(24) },
      body: "private draft",
      signed: { signature: "signature-secret" },
    };
    const metadata = buildMutationErrorMetadata(
      ["write", "post", "create"],
      { response: { status: 422, data: variables } },
    );
    const serialized = JSON.stringify(metadata);

    expect(metadata).toEqual({ operation: "write.post.create", error_class: "http", status: 422 });
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("private draft");
    expect(new TextEncoder().encode(serialized).length).toBeLessThanOrEqual(MAX_REACT_QUERY_METADATA_BYTES);
  });

  test("rejects dynamic key content and bounds primitive metadata", () => {
    const metadata = buildMutationErrorMetadata(
      ["write", "post", "create", "typed search text"],
      { code: "USER_SUPPLIED_CODE", status: 9999, message: "invite-code-secret" },
    );
    const serialized = JSON.stringify(metadata);

    expect(metadata).toEqual({ operation: "unknown", error_class: "unexpected" });
    expect(serialized).not.toContain("typed search text");
    expect(serialized).not.toContain("invite-code-secret");
    expect(new TextEncoder().encode(serialized).length).toBeLessThanOrEqual(MAX_REACT_QUERY_METADATA_BYTES);
  });

  test("does not expose query parameters or original error messages", () => {
    const metadata = buildQueryErrorMetadata(
      ["server", "https://private.node", "search", "private search"],
      new Error("request body contained private search"),
    );
    const safeError = sanitizedTelemetryError("query", metadata);

    expect(metadata).toEqual({ operation: "search", error_class: "unexpected" });
    expect(JSON.stringify(metadata)).not.toContain("private");
    expect(safeError.message).toBe("query unexpected failure");
    expect(safeError.message).not.toContain("request body");
  });
});
