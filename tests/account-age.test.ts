// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
  calculateAccountAgeDays,
  formatAccountAgeLong,
  formatAccountAgeShort,
} from "../src/utils/account-age";

const CREATED_AT = 1_700_000_000;

describe("calculateAccountAgeDays", () => {
  test("treats missing timestamps as zero age", () => {
    expect(calculateAccountAgeDays(null, CREATED_AT)).toBe(0);
    expect(calculateAccountAgeDays(undefined, CREATED_AT)).toBe(0);
    expect(calculateAccountAgeDays(0, CREATED_AT)).toBe(0);
  });

  test("uses unix seconds against an injected now", () => {
    expect(calculateAccountAgeDays(CREATED_AT, CREATED_AT + SECONDS_PER_DAY)).toBe(1);
    expect(calculateAccountAgeDays(CREATED_AT, CREATED_AT + 2 * SECONDS_PER_DAY)).toBe(2);
  });

  test("crosses the exact minute boundary without rounding", () => {
    const justUnder = calculateAccountAgeDays(
      CREATED_AT,
      CREATED_AT + SECONDS_PER_MINUTE - 1,
    );
    const exact = calculateAccountAgeDays(
      CREATED_AT,
      CREATED_AT + SECONDS_PER_MINUTE,
    );
    expect(justUnder).toBeCloseTo((SECONDS_PER_MINUTE - 1) / SECONDS_PER_DAY, 10);
    expect(exact).toBeCloseTo(SECONDS_PER_MINUTE / SECONDS_PER_DAY, 10);
    expect(justUnder * 24 * 60).toBeLessThan(1);
    expect(exact * 24 * 60).toBe(1);
  });

  test("crosses the exact hour boundary without rounding", () => {
    const justUnder = calculateAccountAgeDays(
      CREATED_AT,
      CREATED_AT + SECONDS_PER_HOUR - 1,
    );
    const exact = calculateAccountAgeDays(
      CREATED_AT,
      CREATED_AT + SECONDS_PER_HOUR,
    );
    expect(justUnder * 24).toBeLessThan(1);
    expect(exact * 24).toBe(1);
  });

  test("crosses the exact 24-hour day boundary without rounding", () => {
    const justUnder = calculateAccountAgeDays(
      CREATED_AT,
      CREATED_AT + SECONDS_PER_DAY - 1,
    );
    const exact = calculateAccountAgeDays(
      CREATED_AT,
      CREATED_AT + SECONDS_PER_DAY,
    );
    expect(justUnder).toBeLessThan(1);
    expect(exact).toBe(1);
  });

  test("immediate signup is zero age, not a rounded-up minute", () => {
    expect(calculateAccountAgeDays(CREATED_AT, CREATED_AT)).toBe(0);
    expect(formatAccountAgeShort(0)).toBe("-");
    expect(formatAccountAgeLong(0)).toBe("< 1 hour");
  });

  test("two elapsed minutes format as 2min only when the timestamp is 120s old", () => {
    const days = calculateAccountAgeDays(
      CREATED_AT,
      CREATED_AT + 2 * SECONDS_PER_MINUTE,
    );
    expect(days * 24 * 60).toBe(2);
    expect(formatAccountAgeShort(days)).toBe("2min");
    expect(formatAccountAgeLong(days)).toBe("< 1 hour");
  });

  test("millisecond timestamps are not treated as unix seconds", () => {
    const days = calculateAccountAgeDays(CREATED_AT * 1000, CREATED_AT);
    expect(days).toBeLessThan(0);
    expect(formatAccountAgeShort(days)).toBe("-");
  });
});

describe("formatAccountAgeShort", () => {
  test("floors at the minute boundary", () => {
    expect(formatAccountAgeShort((SECONDS_PER_MINUTE - 1) / SECONDS_PER_DAY)).toBe("-");
    expect(formatAccountAgeShort(SECONDS_PER_MINUTE / SECONDS_PER_DAY)).toBe("1min");
    expect(formatAccountAgeShort((SECONDS_PER_HOUR - 1) / SECONDS_PER_DAY)).toBe("59min");
  });

  test("floors at the hour boundary", () => {
    expect(formatAccountAgeShort(SECONDS_PER_HOUR / SECONDS_PER_DAY)).toBe("1hr");
    expect(formatAccountAgeShort((SECONDS_PER_DAY - 1) / SECONDS_PER_DAY)).toBe("23hr");
  });

  test("increments days only after a full elapsed 24 hours", () => {
    expect(formatAccountAgeShort(1)).toBe("1d");
    expect(formatAccountAgeShort((2 * SECONDS_PER_DAY - 1) / SECONDS_PER_DAY)).toBe("1d");
    expect(formatAccountAgeShort(2)).toBe("2d");
    expect(formatAccountAgeShort(29.999)).toBe("29d");
  });

  test("floors months and years from elapsed days", () => {
    expect(formatAccountAgeShort(30)).toBe("1mo");
    expect(formatAccountAgeShort(364.999)).toBe("12mo");
    expect(formatAccountAgeShort(365)).toBe("1yr");
  });
});

describe("formatAccountAgeLong", () => {
  test("floors at the hour and day boundaries", () => {
    expect(formatAccountAgeLong((SECONDS_PER_HOUR - 1) / SECONDS_PER_DAY)).toBe("< 1 hour");
    expect(formatAccountAgeLong(SECONDS_PER_HOUR / SECONDS_PER_DAY)).toBe("1 hour");
    expect(formatAccountAgeLong((2 * SECONDS_PER_HOUR) / SECONDS_PER_DAY)).toBe("2 hours");
    expect(formatAccountAgeLong((SECONDS_PER_DAY - 1) / SECONDS_PER_DAY)).toBe("23 hours");
    expect(formatAccountAgeLong(1)).toBe("1 day");
    expect(formatAccountAgeLong((2 * SECONDS_PER_DAY - 1) / SECONDS_PER_DAY)).toBe("1 day");
    expect(formatAccountAgeLong(2)).toBe("2 days");
  });
});
