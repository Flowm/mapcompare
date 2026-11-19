import { describe, expect, it } from "vitest";

import {
  atSlot,
  cadenceOf,
  dayOf,
  displayTime,
  slotOf,
  upgradeLegacyTime,
  completedOnly,
  declaredDomain,
  domainFromIntervals,
  domainFromValues,
  endedOn,
  formatTime,
  hasTimeOnDay,
  timeAt,
  humanTime,
  latestTime,
  listTimes,
  parseDuration,
  parseTime,
  resolveTime,
  templateTime,
  timeAfter,
  timeAgo,
  timeBefore,
  timeShiftedBy,
  timesOnDay,
} from "./time";
import type { TimeSpec } from "./types";

const utc = (s: string) => parseTime(s)!;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("parseTime / formatTime", () => {
  it("reads every precision this app writes, and the seconds services add", () => {
    expect(parseTime("2024")).toBe(Date.UTC(2024, 0, 1));
    expect(parseTime("2025-12-18")).toBe(Date.UTC(2025, 11, 18));
    expect(parseTime("2026-11-13T19:00Z")).toBe(Date.UTC(2026, 10, 13, 19));
    expect(parseTime("2026-11-13T19:00:00Z")).toBe(Date.UTC(2026, 10, 13, 19));
    expect(parseTime("2026-11-13T19:00:00.000Z")).toBe(Date.UTC(2026, 10, 13, 19));
  });

  it("rejects calendar-invalid dates rather than rolling them over", () => {
    expect(parseTime("2025-02-30")).toBeUndefined();
    expect(parseTime("2025-13-01")).toBeUndefined();
    expect(parseTime("2025-01-01T24:00Z")).toBeUndefined();
    expect(parseTime("4756")).toBe(Date.UTC(4756, 0, 1));
    expect(parseTime("not-a-year")).toBeUndefined();
  });

  it("writes a Time at its precision, minutes in UTC with a Z", () => {
    const t = Date.UTC(2026, 10, 13, 19, 5, 33);
    expect(formatTime(t, "year")).toBe("2026");
    expect(formatTime(t, "day")).toBe("2026-11-13");
    expect(formatTime(t, "minute")).toBe("2026-11-13T19:05Z");
  });

  it("writes a template Time with seconds, as WMTS and WMS expect", () => {
    expect(templateTime(utc("2026-11-13T19:05Z"), "minute")).toBe("2026-11-13T19:05:00Z");
    expect(templateTime(utc("2026-11-13"), "day")).toBe("2026-11-13");
  });
});

describe("parseDuration", () => {
  it("reads the steps capabilities use", () => {
    expect(parseDuration("P1D")).toBe(DAY);
    expect(parseDuration("PT10M")).toBe(600_000);
    expect(parseDuration("PT1H40M")).toBe(6_000_000);
  });

  it("refuses empty and calendar-relative durations", () => {
    expect(parseDuration("P")).toBeUndefined();
    expect(parseDuration("PT")).toBeUndefined();
    expect(parseDuration("P1M")).toBeUndefined();
  });
});

describe("domains", () => {
  // GOES as GIBS describes it: runs of ten-minute slots with a missing one between them.
  const goes = domainFromIntervals(["2026-11-13T18:00:00Z/2026-11-13T18:20:00Z/PT10M", "2026-11-13T18:40:00Z/2026-11-13T19:00:00Z/PT10M"], "minute");

  it("steps over a gap instead of landing in it", () => {
    expect(formatTime(timeAfter(goes, utc("2026-11-13T18:20Z"))!, "minute")).toBe("2026-11-13T18:40Z");
    expect(formatTime(timeBefore(goes, utc("2026-11-13T18:40Z"))!, "minute")).toBe("2026-11-13T18:20Z");
  });

  it("has nothing past either end", () => {
    expect(timeAfter(goes, utc("2026-11-13T19:00Z"))).toBeUndefined();
    expect(timeBefore(goes, utc("2026-11-13T18:00Z"))).toBeUndefined();
  });

  it("lists the slots of one day", () => {
    expect(timesOnDay(goes, utc("2026-11-13"))).toStrictEqual([
      "2026-11-13T18:00Z",
      "2026-11-13T18:10Z",
      "2026-11-13T18:20Z",
      "2026-11-13T18:40Z",
      "2026-11-13T18:50Z",
      "2026-11-13T19:00Z",
    ]);
    expect(timesOnDay(goes, utc("2026-11-14"))).toStrictEqual([]);
  });

  it("knows which days have a picture, so a calendar can grey out the rest", () => {
    expect(hasTimeOnDay(goes, utc("2026-11-13T07:00Z"))).toBe(true);
    expect(hasTimeOnDay(goes, utc("2026-11-12"))).toBe(false);
    expect(hasTimeOnDay(goes, utc("2026-11-14"))).toBe(false);
  });

  it("shifts by an hour or a day to the frame nearest the same moment then", () => {
    expect(formatTime(timeShiftedBy(goes, utc("2026-11-13T19:00Z"), -HOUR)!, "minute")).toBe("2026-11-13T18:00Z");
    // 19:40 was not recorded, so the nearest frame in that hour.
    expect(formatTime(timeShiftedBy(goes, utc("2026-11-13T18:40Z"), HOUR)!, "minute")).toBe("2026-11-13T19:00Z");
    // 18:30 is the missing slot: a day back from 18:30 takes the nearer frame, not the day's last.
    expect(formatTime(timeShiftedBy(goes, utc("2026-11-14T18:30Z"), -DAY)!, "minute")).toBe("2026-11-13T18:20Z");
  });

  it("greys a step out when that hour or day holds nothing, rather than landing elsewhere", () => {
    expect(timeShiftedBy(goes, utc("2026-11-13T19:00Z"), HOUR)).toBeUndefined();
    expect(timeShiftedBy(goes, utc("2026-11-13T18:00Z"), -HOUR)).toBeUndefined();
    expect(timeShiftedBy(goes, utc("2026-11-13T18:00Z"), -DAY)).toBeUndefined();
    // Every three hours: the hours between are empty both ways, not a three-hour jump back.
    const georing = domainFromIntervals(["2026-11-13T00:00Z/2026-11-13T21:00Z/PT3H"], "minute");
    expect(timeShiftedBy(georing, utc("2026-11-13T12:00Z"), -HOUR)).toBeUndefined();
    expect(timeShiftedBy(georing, utc("2026-11-13T12:00Z"), HOUR)).toBeUndefined();
    // A missing day is not stepped over to the day before it.
    const gap = domainFromIntervals(["2026-11-10T12:00Z/2026-11-11T12:00Z/PT1H", "2026-11-13T12:00Z/2026-11-14T12:00Z/PT1H"], "minute");
    expect(timeShiftedBy(gap, utc("2026-11-13T12:00Z"), -DAY)).toBeUndefined();
    expect(formatTime(timeShiftedBy(gap, utc("2026-11-11T09:00Z"), -DAY)!, "minute")).toBe("2026-11-10T12:00Z");
  });

  it("writes one moment at each Layer's precision", () => {
    expect(timeAt("2026-11-13T18:40Z", "minute")).toBe("2026-11-13T18:40Z");
    expect(timeAt("2026-11-13T18:40Z", "day")).toBe("2026-11-13");
    expect(timeAt("2026-11-13", "year")).toBe("2026");
    expect(timeAt("nonsense", "day")).toBeUndefined();
  });

  it("will not write out a list too long for a dropdown", () => {
    const modis = domainFromIntervals(["2000-02-24/2026-11-13/P1D"], "day");
    expect(listTimes(modis)).toBeUndefined();
    expect(listTimes(goes)).toHaveLength(6);
  });

  it("keeps a listed Time's param, so the template receives the service's own name", () => {
    const wayback = domainFromValues([{ time: "2019-12-12", param: "4756" }], "day");
    expect(resolveTime(wayback, undefined)).toMatchObject({ time: "2019-12-12", value: "4756" });
  });
});

describe("resolveTime", () => {
  const vintages = domainFromValues([{ time: "2018" }, { time: "2019" }, { time: "2025" }], "year");
  const daily = domainFromIntervals(["2026-01-01/2026-01-10/P1D", "2026-01-15/2026-01-20/P1D"], "day");

  it("shows the latest when nothing is asked for, and does not call that a substitution", () => {
    expect(resolveTime(daily, undefined)).toStrictEqual({ time: "2026-01-20", value: "2026-01-20", year: "2026" });
  });

  it("honours a Time that exists", () => {
    expect(resolveTime(daily, "2026-01-05")?.substitution).toBeUndefined();
    expect(resolveTime(vintages, "2019")?.time).toBe("2019");
  });

  it("answers a moment with the Time whose Period contains it, and calls that no substitution", () => {
    // A vintage's Period is its year: March 2025 is the 2025 composite, not "nearest".
    expect(resolveTime(vintages, "2025-03-01")).toMatchObject({ time: "2025" });
    expect(resolveTime(vintages, "2025-03-01")?.substitution).toBeUndefined();
    expect(resolveTime(daily, "2026-01-05T15:30Z")).toStrictEqual({ time: "2026-01-05", value: "2026-01-05", year: "2026" });
    // The newest Time's Period runs to its end too: late on the last day is still that day.
    expect(resolveTime(daily, "2026-01-20T23:00Z")?.substitution).toBeUndefined();
  });

  it("calls a moment inside a snapshot's Period no substitution", () => {
    const snapshots = domainFromValues([{ time: "2024-01-10" }, { time: "2024-06-01" }], "day");
    expect(resolveTime(snapshots, "2024-03-15")).toStrictEqual({ time: "2024-01-10", value: "2024-01-10", year: "2024" });
  });

  it("answers a day the satellite missed with the latest one before it, and says so", () => {
    expect(resolveTime(daily, "2026-01-12")).toMatchObject({ time: "2026-01-10", substitution: { requested: "2026-01-12", reason: "gap" } });
    expect(resolveTime(vintages, "2022")).toMatchObject({ time: "2019", substitution: { requested: "2022", reason: "gap" } });
  });

  it("never answers with a picture of the future", () => {
    expect(resolveTime(daily, "2099-01-01")).toMatchObject({ time: "2026-01-20", substitution: { requested: "2099-01-01", reason: "too-recent" } });
  });

  it("gives the earliest Time to a link older than the whole archive", () => {
    expect(resolveTime(daily, "2020-01-01")).toMatchObject({ time: "2026-01-01", substitution: { requested: "2020-01-01", reason: "before-archive" } });
  });

  it("shows the latest for a request that is not a Time, and says so", () => {
    expect(resolveTime(daily, "yesterday")).toMatchObject({ time: "2026-01-20", substitution: { requested: "yesterday", reason: "unreadable" } });
  });

  it("never reads a bare number as a year where Times carry service ids", () => {
    // 4-digit Wayback release ids look exactly like years; one this build no longer lists must
    // not become a request for the year 1234.
    const wayback = domainFromValues(
      [
        { time: "2019-12-12", param: "4756" },
        { time: "2024-01-10", param: "9999" },
      ],
      "day",
    );
    expect(resolveTime(wayback, "1234")).toMatchObject({ time: "2024-01-10", substitution: { requested: "1234", reason: "unreadable" } });
  });

  it("returns undefined for a domain with nothing in it", () => {
    expect(resolveTime({ precision: "day", ranges: [] }, undefined)).toBeUndefined();
  });
});

describe("upgradeLegacyTime", () => {
  const spec = { precision: "day" as const, label: "Snapshot", values: [{ time: "2019-12-12", param: "4756" }] };

  it("turns a release id this build lists into the snapshot's Time", () => {
    expect(upgradeLegacyTime(spec, "4756")).toBe("2019-12-12");
  });

  it("passes everything else through for resolveTime to judge", () => {
    expect(upgradeLegacyTime(spec, "2019-12-12")).toBe("2019-12-12");
    expect(upgradeLegacyTime(spec, "1234")).toBe("1234");
    expect(upgradeLegacyTime(spec, undefined)).toBeUndefined();
    expect(upgradeLegacyTime(undefined, "4756")).toBe("4756");
  });
});

describe("display", () => {
  it("says a slot's minutes are UTC, and leaves coarser Times alone", () => {
    expect(displayTime("2026-11-13T19:00Z")).toBe("2026-11-13 19:00 UTC");
    expect(displayTime("2026-11-13")).toBe("2026-11-13");
    expect(displayTime("2025")).toBe("2025");
  });

  it("writes a Time the way a person reads it, the same in every locale", () => {
    expect(humanTime("2025")).toBe("2025");
    expect(humanTime("2026-11-08")).toBe("8 Nov 2026");
    expect(humanTime("2026-11-13T00:10Z")).toBe("13 Nov 2026, 00:10 UTC");
    expect(humanTime("not a time")).toBe("not a time");
  });

  it("says how long ago a Time began, coarsely", () => {
    const now = new Date(utc("2026-11-19T01:30Z"));
    expect(timeAgo(utc("2026-11-19T01:30Z"), now)).toBe("just now");
    expect(timeAgo(utc("2026-11-19T00:50Z"), now)).toBe("40 min ago");
    expect(timeAgo(utc("2026-11-18T20:00Z"), now)).toBe("5 h ago");
    expect(timeAgo(utc("2026-11-18"), now)).toBe("yesterday");
    expect(timeAgo(utc("2026-11-07"), now)).toBe("12 days ago");
    expect(timeAgo(utc("2026-08-01"), now)).toBe("3 months ago");
    expect(timeAgo(utc("2025-06-30"), now)).toBe("1 year ago");
    expect(timeAgo(utc("2019-12-12"), now)).toBe("6 years ago");
  });

  it("splits a slot into its day and time of day, and puts them back", () => {
    expect(dayOf("2026-11-13T19:10Z")).toBe("2026-11-13");
    expect(slotOf("2026-11-13T19:10Z")).toBe("19:10");
    expect(slotOf("2026-11-13")).toBeUndefined();
    expect(atSlot("2026-11-14", "19:10")).toBe("2026-11-14T19:10Z");
  });
});

describe("declared domains", () => {
  const now = new Date("2026-03-10T12:00:00Z");

  it("runs a daily series from its first day up to the clock", () => {
    const spec: TimeSpec = { precision: "day", label: "Date", series: { stepMinutes: 1440, earliest: "2026-03-01" } };
    const domain = completedOnly(declaredDomain(spec, now), now);
    // Today is still filling in, so the latest is yesterday.
    expect(resolveTime(domain, undefined)?.time).toBe("2026-03-09");
    expect(resolveTime(domain, "2026-02-01")?.time).toBe("2026-03-01");
  });

  it("keeps a lagging series behind the clock by its latency", () => {
    const spec: TimeSpec = { precision: "day", label: "Date", series: { stepMinutes: 1440, earliest: "2026-01-01", latencyMinutes: 4 * 1440 } };
    expect(resolveTime(completedOnly(declaredDomain(spec, now), now), undefined)?.time).toBe("2026-03-06");
  });

  it("rolls a retention window forward with the clock", () => {
    const spec: TimeSpec = { precision: "minute", label: "Time", series: { stepMinutes: 60, retentionDays: 0.25 } };
    const domain = completedOnly(declaredDomain(spec, now), now);
    expect(listTimes(domain)).toStrictEqual([
      "2026-03-10T06:00Z",
      "2026-03-10T07:00Z",
      "2026-03-10T08:00Z",
      "2026-03-10T09:00Z",
      "2026-03-10T10:00Z",
      "2026-03-10T11:00Z",
      "2026-03-10T12:00Z",
    ]);
  });

  it("shows a frame as soon as the service lists it, but never a composite still filling in", () => {
    const frames = domainFromIntervals(["2026-03-10T00:00Z/2026-03-10T11:50Z/PT10M"], "minute");
    // The 11:50 frame was recorded at 11:50; it is finished, though its slot runs to 12:00.
    expect(latestTime(completedOnly(frames, new Date("2026-03-10T11:52:00Z")))).toBe(utc("2026-03-10T11:50Z"));
    const days = domainFromIntervals(["2026-03-01/2026-03-10/P1D"], "day");
    expect(latestTime(completedOnly(days, now))).toBe(utc("2026-03-09"));
  });

  it("lists a fixed list as it is", () => {
    const spec: TimeSpec = { precision: "year", label: "Vintage", values: [{ time: "2018" }, { time: "2019" }] };
    expect(listTimes(declaredDomain(spec, now))).toStrictEqual(["2018", "2019"]);
  });
});

describe("cadence and ending", () => {
  const series: TimeSpec = { precision: "day", label: "Date", series: { stepMinutes: 1440, earliest: "2020-01-01" } };

  it("derives Cadence from how far apart the Times are, not from how they are declared", () => {
    expect(cadenceOf(undefined)).toBe("static");
    expect(cadenceOf(series)).toBe("daily");
    expect(cadenceOf({ precision: "minute", label: "Time", series: { stepMinutes: 10, retentionDays: 90 } })).toBe("sub-daily");
    expect(cadenceOf({ precision: "year", label: "Vintage", values: [{ time: "2018" }, { time: "2019" }, { time: "2020" }] })).toBe("yearly");
    expect(cadenceOf({ precision: "day", label: "Month", values: [{ time: "2026-01-01" }, { time: "2026-02-01" }, { time: "2026-03-01" }] })).toBe("monthly");
  });

  it("reads a listed set by its median gap, so one short gap does not change it", () => {
    const snapshots: TimeSpec = { precision: "day", label: "Snapshot", values: [{ time: "2023-12-07" }, { time: "2024-12-12" }, { time: "2025-12-18" }, { time: "2026-06-30" }] };
    expect(cadenceOf(snapshots)).toBe("yearly");
  });

  it("calls a single listed Time static, having no spacing to read", () => {
    expect(cadenceOf({ precision: "year", label: "Vintage", values: [{ time: "2018" }] })).toBe("static");
  });

  it("does not end a series that is merely a few days late", () => {
    const domain = domainFromIntervals(["2020-01-01/2026-03-07/P1D"], "day");
    expect(endedOn(domain, series, new Date("2026-03-10T12:00:00Z"))).toBeUndefined();
  });

  it("ends a series that has fallen ten steps behind", () => {
    const domain = domainFromIntervals(["2020-01-01/2026-02-01/P1D"], "day");
    expect(endedOn(domain, series, new Date("2026-03-10T12:00:00Z"))).toBe("2026-02-01");
  });

  it("never ends a list of vintages", () => {
    const spec: TimeSpec = { precision: "year", label: "Vintage", values: [{ time: "2018" }] };
    expect(endedOn(declaredDomain(spec, new Date()), spec, new Date("2040-01-01"))).toBeUndefined();
  });
});
