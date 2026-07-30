import { describe, expect, it } from "vitest";

import { clampDate, parseUtcDate, utcDateString, yesterdayUTC } from "./dates";

describe("utcDateString", () => {
  it("formats as YYYY-MM-DD in UTC", () => {
    expect(utcDateString(new Date("2026-07-30T13:45:12Z"))).toBe("2026-07-30");
  });

  it("uses UTC rather than local time near midnight", () => {
    // 23:30 UTC is already the next day in CEST, but must still report the UTC date.
    expect(utcDateString(new Date("2026-07-30T23:30:00Z"))).toBe("2026-07-30");
  });
});

describe("yesterdayUTC", () => {
  it("steps back one day", () => {
    expect(yesterdayUTC(new Date("2026-07-30T00:00:00Z"))).toBe("2026-07-29");
  });

  it("crosses month and year boundaries", () => {
    expect(yesterdayUTC(new Date("2026-03-01T05:00:00Z"))).toBe("2026-02-28");
    expect(yesterdayUTC(new Date("2026-01-01T05:00:00Z"))).toBe("2025-12-31");
  });

  it("handles a leap day", () => {
    expect(yesterdayUTC(new Date("2024-03-01T05:00:00Z"))).toBe("2024-02-29");
  });
});

describe("parseUtcDate", () => {
  it("accepts a well-formed date", () => {
    expect(parseUtcDate("2026-07-30")?.toISOString()).toBe("2026-07-30T00:00:00.000Z");
  });

  it.each(["2026-7-30", "26-07-30", "2026/07/30", "", "yesterday", "2026-07-30T00:00:00Z"])("rejects malformed %o", (s) => {
    expect(parseUtcDate(s)).toBeUndefined();
  });

  it("rejects calendar-invalid dates instead of rolling them over", () => {
    expect(parseUtcDate("2025-02-30")).toBeUndefined();
    expect(parseUtcDate("2026-13-01")).toBeUndefined();
  });

  it("accepts a real leap day but not a fake one", () => {
    expect(parseUtcDate("2024-02-29")).toBeDefined();
    expect(parseUtcDate("2025-02-29")).toBeUndefined();
  });
});

describe("clampDate", () => {
  const start = "2017-01-01";
  const end = "2026-07-29";

  it("passes through a date inside the window", () => {
    expect(clampDate("2020-06-15", start, end)).toBe("2020-06-15");
  });

  it("clamps to the bounds", () => {
    expect(clampDate("2001-01-01", start, end)).toBe(start);
    expect(clampDate("2030-01-01", start, end)).toBe(end);
  });

  it("keeps the inclusive bounds themselves", () => {
    expect(clampDate(start, start, end)).toBe(start);
    expect(clampDate(end, start, end)).toBe(end);
  });

  it("falls back to the end of the window for unparseable input", () => {
    expect(clampDate("not-a-date", start, end)).toBe(end);
  });
});
