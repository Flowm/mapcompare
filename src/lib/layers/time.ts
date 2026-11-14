import type { DiscoveredTimes } from "./discovery";
import type { TimePrecision, TimeSpec } from "./types";

/**
 * Which pictures a Layer has, and which one a request means.
 *
 * Everything here is pure, and the clock is always a parameter. A Layer's Times are held as
 * ranges rather than a list: MODIS Terra alone has some 9,500 daily pictures and GOES some 13,000
 * ten-minute frames, while their capabilities describe both in a few dozen `start/end/step`
 * runs — with the gaps where a satellite was down.
 *
 * A request resolves to the latest Time at or before it. Each Time's Period runs from its own
 * moment to the next Time's, so that one rule is "the Time whose Period contains it, else the
 * latest one before it": 2025-03-01 asks EOX for its 2025 vintage, VIIRS for that day, and Wayback
 * for the snapshot published on or before it, and never for a picture of the future.
 */

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export interface TimeRange {
  /** Milliseconds, UTC. */
  start: number;
  end: number;
  /** 0 for a single Time. */
  step: number;
}

export interface TimeDomain {
  precision: TimePrecision;
  /** Sorted by start, non-overlapping. */
  ranges: readonly TimeRange[];
  /** Formatted Time -> what the template receives instead. */
  params?: ReadonlyMap<string, string>;
}

// ------------------------------------------------------------------------------- writing

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** How a Time is written in the URL and on screen. */
export function formatTime(ms: number, precision: TimePrecision): string {
  const d = new Date(ms);
  const year = pad(d.getUTCFullYear(), 4);
  if (precision === "year") return year;
  const day = `${year}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (precision === "day") return day;
  return `${day}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`;
}

/** How a Time is written into a tile template: WMTS and WMS want seconds on a datetime. */
export function templateTime(ms: number, precision: TimePrecision): string {
  if (precision !== "minute") return formatTime(ms, precision);
  return `${formatTime(ms, "day")}T${new Date(ms).toISOString().slice(11, 16)}:00Z`;
}

/** A formatted Time as a label reads it: a slot's minutes are UTC, so they say so. */
export function displayTime(time: string): string {
  return time.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})Z$/, "$1 $2 UTC");
}

/** The UTC day of a formatted Time, as a date input holds it. */
export function dayOf(time: string): string {
  return time.slice(0, 10);
}

/** The UTC slot of a formatted minute Time (`HH:MM`), or undefined for a coarser one. */
export function slotOf(time: string): string | undefined {
  return /T(\d{2}:\d{2})Z$/.exec(time)?.[1];
}

/** A day at a slot, written as a minute Time. */
export function atSlot(day: string, slot: string): string {
  return `${day}T${slot}Z`;
}

const TIME_PATTERN = /^(\d{4})(?:-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?Z)?)?$/;

/**
 * Reads any Time this app writes, plus the seconds services add. Calendar-invalid input
 * (2025-02-30) is rejected rather than rolled over, as `Date` would.
 */
export function parseTime(s: string): number | undefined {
  const m = TIME_PATTERN.exec(s.trim());
  if (!m) return undefined;
  const [, y, mo = "01", d = "01", h = "00", mi = "00", se = "00"] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
  const back = new Date(ms);
  if (back.getUTCMonth() !== Number(mo) - 1 || back.getUTCDate() !== Number(d)) return undefined;
  if (Number(h) > 23 || Number(mi) > 59) return undefined;
  return ms;
}

export function floorTo(ms: number, precision: TimePrecision): number {
  const d = new Date(ms);
  if (precision === "year") return Date.UTC(d.getUTCFullYear(), 0, 1);
  if (precision === "day") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor(ms / MINUTE) * MINUTE;
}

/** ISO 8601 durations as capabilities write them: `P1D`, `PT10M`, `PT1H40M`. Months and years are not regular steps. */
export function parseDuration(s: string): number | undefined {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s.trim());
  if (!m || s.trim() === "P" || s.trim() === "PT") return undefined;
  const [, d = "0", h = "0", mi = "0", se = "0"] = m;
  const ms = ((Number(d) * 24 + Number(h)) * 60 + Number(mi)) * MINUTE + Number(se) * 1000;
  return ms > 0 ? ms : undefined;
}

// --------------------------------------------------------------------------- building

/**
 * Builds a domain from capabilities-style entries: `start/end/period` runs and single values,
 * in any order. Entries that cannot be read are dropped rather than failing the whole Layer.
 */
export function domainFromIntervals(entries: readonly string[], precision: TimePrecision): TimeDomain {
  const ranges: TimeRange[] = [];
  for (const raw of entries) {
    for (const entry of raw.split(",")) {
      const parts = entry.trim().split("/");
      if (parts.length === 3) {
        const start = parseTime(parts[0]!);
        const end = parseTime(parts[1]!);
        const step = parseDuration(parts[2]!);
        if (start === undefined || end === undefined || step === undefined || end < start) continue;
        ranges.push({ start: floorTo(start, precision), end: floorTo(end, precision), step });
      } else if (parts.length === 1 && parts[0] !== "") {
        const at = parseTime(parts[0]!);
        if (at !== undefined) ranges.push({ start: floorTo(at, precision), end: floorTo(at, precision), step: 0 });
      }
    }
  }
  return { precision, ranges: normalise(ranges) };
}

/** A domain of single Times, each optionally carrying the param the template receives. */
export function domainFromValues(values: readonly { time: string; param?: string }[], precision: TimePrecision): TimeDomain {
  const ranges: TimeRange[] = [];
  const params = new Map<string, string>();
  for (const v of values) {
    const at = parseTime(v.time);
    if (at === undefined) continue;
    const start = floorTo(at, precision);
    ranges.push({ start, end: start, step: 0 });
    if (v.param !== undefined) params.set(formatTime(start, precision), v.param);
  }
  return { precision, ranges: normalise(ranges), ...(params.size > 0 ? { params } : {}) };
}

function normalise(ranges: TimeRange[]): TimeRange[] {
  const sorted = ranges.toSorted((a, b) => a.start - b.start);
  const out: TimeRange[] = [];
  for (const r of sorted) {
    const prev = out.at(-1);
    if (prev && prev.step === 0 && r.step === 0 && prev.start === r.start) continue;
    out.push(r);
  }
  return out;
}

/**
 * What a Layer declares about its Times, computed from the clock. For Layers that can ask
 * their service this is the fallback; for the rest it is the whole truth.
 */
export function declaredDomain(spec: TimeSpec, now: Date): TimeDomain {
  if (spec.values) return domainFromValues(spec.values, spec.precision);
  const series = spec.series;
  if (!series) return { precision: spec.precision, ranges: [] };

  const step = series.stepMinutes * MINUTE;
  const newest = now.getTime() - (series.latencyMinutes ?? 0) * MINUTE;
  const earliest = series.earliest === undefined ? undefined : parseTime(series.earliest);
  const rolling = series.retentionDays === undefined ? undefined : Math.ceil((newest - series.retentionDays * DAY) / step) * step;
  const bounds = [earliest, rolling].filter((b): b is number => b !== undefined);
  if (bounds.length === 0) return { precision: spec.precision, ranges: [] };

  const start = Math.max(...bounds);
  const end = start + Math.floor((newest - start) / step) * step;
  if (end < start) return { precision: spec.precision, ranges: [] };
  return { precision: spec.precision, ranges: [{ start, end, step }] };
}

/**
 * What a service said, as the Times a pane may show: none still filling in. Undefined
 * when the service said nothing usable, so the caller decides what that means — the app falls
 * back to the declared rules, the probe calls it a failure.
 */
export function discoveredTimeDomain(found: DiscoveredTimes | undefined, precision: TimePrecision, now: Date): TimeDomain | undefined {
  if (!found) return undefined;
  const domain = "intervals" in found ? domainFromIntervals(found.intervals, precision) : domainFromValues(found.values, precision);
  return domain.ranges.length > 0 ? completedOnly(domain, now) : undefined;
}

/** A Layer's declared Times as of `now`, without the ones still filling in. */
export function declaredTimeDomain(spec: TimeSpec, now: Date): TimeDomain {
  return completedOnly(declaredDomain(spec, now), now);
}

/**
 * Removes the Times still filling in. A composite gathers its picture across its Period: GIBS
 * lists today's MODIS while half the planet is still missing, so a day is never "latest" before
 * it is over. A frame is not a composite: a geostationary image is recorded within minutes of its
 * Time, so it is finished the moment the service publishes it, and hiding it until the next slot
 * would only make the newest picture late. Single Times (EOX composites, Wayback snapshots) are
 * published finished too.
 */
export function completedOnly(domain: TimeDomain, now: Date): TimeDomain {
  if (isFrame(domain.precision)) return domain;
  const ranges: TimeRange[] = [];
  for (const r of domain.ranges) {
    if (r.step === 0) {
      ranges.push(r);
      continue;
    }
    const lastComplete = now.getTime() - r.step;
    if (lastComplete < r.start) continue;
    ranges.push({ ...r, end: Math.min(r.end, r.start + Math.floor((lastComplete - r.start) / r.step) * r.step) });
  }
  return { ...domain, ranges };
}

/** A Time written to the minute is a frame, recorded at that moment; anything coarser is a composite. */
export function isFrame(precision: TimePrecision): boolean {
  return precision === "minute";
}

// ---------------------------------------------------------------------------- reading

export function earliestTime(domain: TimeDomain): number | undefined {
  return domain.ranges[0]?.start;
}

export function latestTime(domain: TimeDomain): number | undefined {
  let latest: number | undefined;
  for (const r of domain.ranges) latest = latest === undefined ? r.end : Math.max(latest, r.end);
  return latest;
}

/** The latest Time at or before `t`, or undefined when `t` precedes them all. */
export function timeAtOrBefore(domain: TimeDomain, t: number): number | undefined {
  let best: number | undefined;
  for (const r of domain.ranges) {
    if (r.start > t) break;
    const candidate = r.step === 0 ? r.start : r.start + Math.floor((Math.min(t, r.end) - r.start) / r.step) * r.step;
    best = best === undefined ? candidate : Math.max(best, candidate);
  }
  return best;
}

/** The earliest Time strictly after `t`. */
export function timeAfter(domain: TimeDomain, t: number): number | undefined {
  let best: number | undefined;
  for (const r of domain.ranges) {
    if (r.end <= t) continue;
    const candidate = r.start > t ? r.start : r.start + (Math.floor((t - r.start) / r.step) + 1) * r.step;
    if (candidate > r.end) continue;
    best = best === undefined ? candidate : Math.min(best, candidate);
  }
  return best;
}

export function timeBefore(domain: TimeDomain, t: number): number | undefined {
  return timeAtOrBefore(domain, t - 1);
}

/** Every Time in the domain, written out, or undefined when there are more than `limit`. */
export function listTimes(domain: TimeDomain, limit = 400): string[] | undefined {
  const out: string[] = [];
  for (const r of domain.ranges) {
    const count = r.step === 0 ? 1 : Math.floor((r.end - r.start) / r.step) + 1;
    if (out.length + count > limit) return undefined;
    for (let i = 0; i < count; i += 1) out.push(formatTime(r.start + i * r.step, domain.precision));
  }
  return out;
}

/** The Times that fall within one UTC day — the slots a sub-daily control offers for a date. */
export function timesOnDay(domain: TimeDomain, day: number): string[] {
  const from = floorTo(day, "day");
  const to = from + DAY;
  const out: string[] = [];
  for (let t = timeAfter(domain, from - 1); t !== undefined && t < to; t = timeAfter(domain, t)) out.push(formatTime(t, domain.precision));
  return out;
}

/**
 * Why a pane is not showing the Time it was asked for. Each reads differently on the pane,
 * because each means something different to someone holding a shared link.
 *
 * - `gap`             the Layer has no picture then — a day the satellite missed
 * - `too-recent`      the Layer has nothing that new yet
 * - `before-archive`  the archive no longer reaches back that far — a rolling window moved on
 * - `unreadable`      the request is not a Time this Layer understands
 */
export type SubstitutionReason = "gap" | "too-recent" | "before-archive" | "unreadable";

export interface ResolvedTime {
  /** The Time shown, written out. */
  time: string;
  /** What `{TIME}` in the template becomes. */
  value: string;
  /** For credits that name the year of the picture. */
  year: string;
  /**
   * Present when the pane shows something other than what was asked for. A request the shown
   * Time's Period covers is not a substitution: 19:05 on a ten-minute Layer IS its 19:00 frame.
   */
  substitution?: { requested: string; reason: SubstitutionReason };
}

/** The median gap between a domain's single Times, which is how long the newest one stands for. */
function typicalSingleGap(domain: TimeDomain): number | undefined {
  const singles = domain.ranges.filter((r) => r.step === 0).map((r) => r.start);
  const gaps = singles
    .slice(1)
    .map((t, i) => t - singles[i]!)
    .toSorted((a, b) => a - b);
  return gaps.length === 0 ? undefined : gaps[Math.floor(gaps.length / 2)];
}

/**
 * Where the Period of Time `t` ends. A Time in a regular run stands for one step. A single Time
 * — a Wayback snapshot, a STAC item — stands until the next one, and the newest for as long as
 * its siblings usually do. A yearly vintage stands for its own year, so a missing year is a gap.
 */
export function periodEnd(domain: TimeDomain, t: number): number {
  for (const r of domain.ranges) {
    if (r.step > 0 && t >= r.start && t <= r.end && (t - r.start) % r.step === 0) return t + r.step;
  }
  // A vintage stands for its calendar year, however long until the next one is published.
  if (domain.precision === "year") return Date.UTC(new Date(t).getUTCFullYear() + 1, 0, 1);
  const next = timeAfter(domain, t);
  if (next !== undefined) return next;
  const gap = typicalSingleGap(domain);
  return gap === undefined ? Number.POSITIVE_INFINITY : t + gap;
}

/**
 * Old Wayback links name a release id where the Time now goes. Read once, when a link is opened,
 * so the URL upgrades itself to the ISO Time on its next write and nothing downstream has to
 * know release ids ever existed. Anything else passes through untouched.
 */
export function upgradeLegacyTime(spec: TimeSpec | undefined, requested: string | undefined): string | undefined {
  if (requested === undefined || !spec?.values) return requested;
  return spec.values.find((v) => v.param !== undefined && v.param === requested)?.time ?? requested;
}

/**
 * Turns a requested Time into one that exists.
 *
 * No request means the latest. Anything else resolves to the Time whose Period contains it,
 * else the latest one before it; a request older than the whole archive — a pinned link to a
 * rolling window that has since moved on — gets the earliest. Every case that is not "the
 * Period contains it" is reported with its reason, never silent.
 */
export function resolveTime(domain: TimeDomain, requested: string | undefined): ResolvedTime | undefined {
  const latest = latestTime(domain);
  const earliest = earliestTime(domain);
  if (latest === undefined || earliest === undefined) return undefined;

  const shown = (chosen: number, substitution?: ResolvedTime["substitution"]): ResolvedTime => {
    const time = formatTime(chosen, domain.precision);
    return { time, value: domain.params?.get(time) ?? templateTime(chosen, domain.precision), year: formatTime(chosen, "year"), ...(substitution ? { substitution } : {}) };
  };

  if (requested === undefined) return shown(latest);

  // A bare number where Times carry service ids is an id this build no longer lists, never the
  // year 4756. Known ids were upgraded when the link was opened.
  const isStaleId = domain.params !== undefined && /^\d+$/.test(requested.trim());
  const at = isStaleId ? undefined : parseTime(requested);
  if (at === undefined) return shown(latest, { requested, reason: "unreadable" });

  const t = floorTo(at, domain.precision);
  const asked = formatTime(t, domain.precision);
  const found = timeAtOrBefore(domain, t);
  if (found === undefined) return shown(earliest, { requested: asked, reason: "before-archive" });
  if (t < periodEnd(domain, found)) return shown(found);
  return shown(found, { requested: asked, reason: found === latest ? "too-recent" : "gap" });
}

// ---------------------------------------------------------------------------- cadence

export type Cadence = "static" | "sub-daily" | "daily" | "monthly" | "yearly";

/**
 * How far apart a Layer's Times typically are: a series' own step, or the median gap of a listed
 * set. The median, because a list's newest gap is often short — Wayback's latest kept snapshot
 * is only six months after the one before — and that must not turn a yearly Layer into a
 * monthly one.
 */
export function typicalStepMinutes(spec: TimeSpec): number | undefined {
  if (spec.series) return spec.series.stepMinutes;
  const times = (spec.values ?? []).map((v) => parseTime(v.time)).filter((t): t is number => t !== undefined);
  const gaps = times
    .slice(1)
    .map((t, i) => (t - times[i]!) / MINUTE)
    .toSorted((a, b) => a - b);
  return gaps.length === 0 ? undefined : gaps[Math.floor(gaps.length / 2)];
}

/**
 * A Layer's Cadence, derived from how far apart its Times are rather than from how they are
 * declared: EOX's composites and Wayback's kept snapshots are both a picture a year, so both are
 * yearly, the same as a yearly series would be.
 */
export function cadenceOf(spec: TimeSpec | undefined): Cadence {
  const step = spec ? typicalStepMinutes(spec) : undefined;
  if (step === undefined) return "static";
  if (step < 24 * 60) return "sub-daily";
  if (step < 28 * 24 * 60) return "daily";
  if (step < 300 * 24 * 60) return "monthly";
  return "yearly";
}

/**
 * The date a regular series stopped, when its newest Time has fallen far behind its Cadence:
 * ten steps, and never less than three days, so a late or patchy night does not end a Layer.
 * A listed set of Times is edited by hand when a new one appears, so it never ends on its own.
 */
export function endedOn(domain: TimeDomain, spec: TimeSpec, now: Date): string | undefined {
  if (!spec.series) return undefined;
  const latest = latestTime(domain);
  if (latest === undefined) return undefined;
  const allowance = Math.max(10 * spec.series.stepMinutes * MINUTE, 3 * DAY);
  return now.getTime() - latest > allowance ? formatTime(latest, "day") : undefined;
}
