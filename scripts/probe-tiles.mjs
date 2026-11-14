#!/usr/bin/env node
/**
 * Re-checks the registry against the live services: the measured `maxzoom` ceiling, the
 * `tileSize` in pixels, and — for Layers with Times — that the service is still publishing.
 *
 * Both fail silently in the browser. A `maxzoom` set too high sprays 404s and blanks the
 * pane; a wrong `tileSize` renders plausible imagery a whole zoom level off, which in a
 * comparison tool produces confidently wrong conclusions. Third-party endpoints drift, so
 * this exists to catch that drift with one command.
 *
 * Requests one tile at `maxzoom` and one at `maxzoom + 1` over a point known to be covered,
 * and reads the pixel dimensions out of the returned image.
 *
 *   pnpm run probe-tiles
 *
 * The freshness check exists because Layers die quietly: Suomi NPP stopped eleven days before
 * this was written, and its tiles simply began to 404. A time-aware Layer is FAIL when its newest
 * Time has fallen ten steps (and at least three days) behind the clock — the same rule the app
 * uses to mark a Layer "ended" — or when its service cannot say which Times it has.
 *
 * Times are resolved with the app's own `time.ts` and `discovery.ts`, imported straight from
 * src: Node strips their types, and neither imports anything that needs a bundler.
 *
 * Keyed Layers are skipped unless the matching VITE_* var is exported into the shell.
 * Redirects are followed: Esri Wayback answers 301 for most tiles, pointing at whichever
 * release last changed that tile, which browsers follow transparently.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { canDiscover, discoverTimes, wmsTemplate } from "../src/lib/layers/discovery.ts";
import { declaredTimeDomain, discoveredTimeDomain, endedOn, formatTime, latestTime, resolveTime } from "../src/lib/layers/time.ts";

/**
 * Three probe points, chosen so that each catches a different way "global" turns out to be a lie.
 *
 * One European point is not enough, and trusting it cost real debugging time twice. Sentinel-2
 * cloudless 2017 serves Amsterdam happily and answers every non-European tile with a 116-byte
 * transparent PNG. Esri World Imagery serves Amsterdam to z20 and hands Tokyo, Munich, Dubai and
 * Sao Paulo a grey "Map data not yet available" tile at the same zoom. Neither is visible from
 * Amsterdam, and both arrive as a 200.
 *
 * Tokyo is the load-bearing one: a major city on the other side of the planet, where any layer
 * calling itself global must have real imagery at its declared ceiling. The Aral Sea is remote
 * on purpose — high-resolution imagery genuinely thins out over wilderness, so a gap there is
 * only a failure for a provider that has not declared a `coverageNote`.
 */
const POINTS = [
  { lat: 52.373, lon: 4.893, name: "Amsterdam" },
  { lat: 35.69, lon: 139.7, name: "Tokyo" },
  { lat: 43.7681, lon: 59.0219, name: "Aral Sea", remote: true },
];

/**
 * Deep Pacific, thousands of kilometres from any land. Nothing here is worth imaging at high
 * zoom, so whatever a provider returns over this point at a given zoom IS its no-data response
 * — which is how the grey Esri tile gets recognised without hardcoding anyone's bytes.
 */
const CONTROL = { lat: -10, lon: -150, name: "mid-Pacific" };

/** Low enough that every globally-scoped layer must have data at all probe points. */
const COVERAGE_ZOOM = 8;

function tileXY(lat, lon, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

/** Reads intrinsic pixel dimensions from JPEG, PNG or WebP bytes. */
function imageSize(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xc3) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  }
  if (buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") {
    const fourcc = buf.subarray(12, 16).toString();
    if (fourcc === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (fourcc === "VP8L") {
      const bits = buf.readUInt32LE(21);
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (fourcc === "VP8X") return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
  }
  return null;
}

const REGISTRY = readFileSync(new URL("../src/lib/layers/registry.ts", import.meta.url), "utf8");

/** A module-level constant of the registry: a string literal, or a product like `24 * 60`. */
function constant(name, src = REGISTRY) {
  const raw = new RegExp(`const ${name} = ([^;]+);`).exec(src)?.[1]?.trim();
  if (raw === undefined) throw new Error(`registry.ts declares no constant ${name}`);
  return /^["']/.test(raw) ? raw.slice(1, -1) : number(raw, src);
}

/** `4 * DAILY`, `90`, `0.25`: the only arithmetic the registry's literals use. */
function number(expr, src = REGISTRY) {
  return expr.split("*").reduce((product, factor) => {
    const f = factor.trim();
    return product * (/^[\d.]+$/.test(f) ? Number(f) : constant(f, src));
  }, 1);
}

function stringField(body, name) {
  const match = new RegExp(`\\n\\s{4}${name}:\\s*(?:"([^"]+)"|([A-Z_]+))`).exec(body);
  if (!match) return undefined;
  return match[1] ?? constant(match[2]);
}

/** The Time spec, in the shape `time.ts` expects. */
function timeSpec(body) {
  const block = /\n\s{4}time: \{([\s\S]*?)\},?\n\s{2}\}/.exec(`${body}\n  }`)?.[1] ?? /\n\s{4}time: (\{.*\}),?\n/.exec(body)?.[1];
  if (!block) return undefined;
  const precision = /precision: "(\w+)"/.exec(block)?.[1];
  let values;
  if (block.includes("WAYBACK_RELEASES")) {
    const file = readFileSync(new URL("../src/lib/layers/waybackReleases.ts", import.meta.url), "utf8");
    values = [...file.matchAll(/\{ time: "([^"]+)", param: "([^"]+)" \}/g)].map((m) => ({ time: m[1], param: m[2] }));
  } else if (block.includes("values:")) {
    values = [...block.matchAll(/\{ time: "([^"]+)"(?:, param: "([^"]+)")? \}/g)].map((m) => ({ time: m[1], ...(m[2] ? { param: m[2] } : {}) }));
  }
  const seriesBlock = /series: \{([^}]*)\}/.exec(block)?.[1];
  const series = seriesBlock && {
    stepMinutes: number(/stepMinutes: ([^,}]+)/.exec(seriesBlock)[1]),
    ...(/earliest: "([^"]+)"/.test(seriesBlock) ? { earliest: /earliest: "([^"]+)"/.exec(seriesBlock)[1] } : {}),
    ...(/latencyMinutes: ([^,}]+)/.test(seriesBlock) ? { latencyMinutes: number(/latencyMinutes: ([^,}]+)/.exec(seriesBlock)[1]) } : {}),
    ...(/retentionDays: ([^,}]+)/.test(seriesBlock) ? { retentionDays: number(/retentionDays: ([^,}]+)/.exec(seriesBlock)[1]) } : {}),
  };
  return { precision, label: "", ...(values ? { values } : {}), ...(series ? { series } : {}) };
}

/**
 * Pulls the Layer table out of registry.ts without a TS toolchain: the registry imports a
 * generated module by an extensionless path, which Node will not resolve, and the fields this
 * needs are all literals.
 */
function readRegistry() {
  const layers = [];
  for (const [, block] of REGISTRY.matchAll(/\{\s*\n\s{4}id: "([\s\S]*?)\n\s{2}\},\n/g)) {
    const body = `\n    id: "${block}`;
    const id = /^([\w.]+)"/.exec(block)?.[1];
    const kind = /\n\s{4}kind: "(\w+)"/.exec(body)?.[1];
    if (!id || kind === "style" || kind === "cog") continue;
    const layer = {
      id,
      kind,
      tileSize: Number(/tileSize: (\d+)/.exec(body)?.[1] ?? 256),
      maxzoom: Number(/maxzoom: (\d+)/.exec(body)?.[1]),
      requiresKey: /requiresKey: "(\w+)"/.exec(body)?.[1],
      // `\s*` because the formatter wraps a long note onto its own line, and a coverageNote that
      // reads as absent silently turns documented patchiness back into a hard failure.
      coverageNote: /coverageNote:\s*"/.test(body),
      probePoint: (() => {
        const m = /probePoint: \{ lat: (-?[\d.]+), lon: (-?[\d.]+), name: "([^"]+)" \}/.exec(body);
        return m ? { lat: Number(m[1]), lon: Number(m[2]), name: m[3] } : undefined;
      })(),
      daylightOnly: /daylightOnly: true/.test(body),
      time: timeSpec(body),
      tile: /tiles: \["([^"]+)"\]/.exec(body)?.[1],
      capabilities: stringField(body, "capabilities"),
      layer: stringField(body, "layer"),
      url: stringField(body, "url"),
      layers: stringField(body, "layers"),
      collection: stringField(body, "collection"),
      asset: stringField(body, "asset"),
    };
    // A WMS tile is a GetMap request for the tile's bbox, built exactly as the app builds it.
    if (kind === "wms") layer.tile = wmsTemplate(layer);
    layers.push(layer);
  }
  return layers;
}

async function text(url) {
  const res = await fetch(url, { headers: { "User-Agent": "mapcompare-probe" } });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.text();
}

/**
 * The app's own discovery, through Node's fetch. Unlike the app, a service that cannot say which
 * Times it has is a failure here rather than a reason to fall back to the declared rules.
 */
async function timeDomain(p, now) {
  if (!canDiscover(p)) return declaredTimeDomain(p.time, now);
  const domain = discoveredTimeDomain(await discoverTimes(p, text), p.time.precision, now);
  if (!domain) throw new Error(`the service describes no Times for ${p.layer ?? p.layers ?? p.collection}`);
  return domain;
}

/**
 * The point with the sun overhead at a moment: its longitude from the hour, its latitude from the
 * season. Where a daylight-only Layer is checked, since anywhere else may be night.
 */
function subsolarPoint(ms) {
  const d = new Date(ms);
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60;
  const lon = (((((12 - hours) * 15 + 180) % 360) + 360) % 360) - 180;
  const dayOfYear = (ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000;
  const lat = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, name: "under the sun" };
}

/** A Web Mercator tile's bbox, for WMS. */
function bbox(z, x, y) {
  const half = 20037508.342789244;
  const size = (2 * half) / 2 ** z;
  return [-half + x * size, half - (y + 1) * size, -half + (x + 1) * size, half - y * size].join(",");
}

function buildUrl(p, z, point) {
  const { x, y } = tileXY(point.lat, point.lon, z);
  let url = p.tile
    .replaceAll("{z}", String(z))
    .replaceAll("{x}", String(x))
    .replaceAll("{y}", String(y))
    .replaceAll("{bbox-epsg-3857}", bbox(z, x, y));
  if (p.requiresKey) url = url.replaceAll("{KEY}", process.env[p.requiresKey] ?? "");
  // The Time the app shows by default: the latest, resolved by the app's own rules.
  if (p.resolvedTime) url = url.replaceAll("{TIME}", p.resolvedTime.value).replaceAll("{YEAR}", p.resolvedTime.year);
  return url;
}

/** One retry, because a dropped connection otherwise reads exactly like "no coverage here". */
async function probe(url, attempt = 0) {
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "mapcompare-probe" } });
    if (!res.ok) return { status: res.status };
    const buf = Buffer.from(await res.arrayBuffer());
    // A tiny payload, or a PNG where the URL asked for .jpg, is a "no data here" placeholder
    // rather than imagery. It arrives as a 200, so only the bytes give it away.
    const isPng = buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
    const placeholder = buf.length < 1000 || (isPng && /\.jpe?g(\?|$)/i.test(url));
    // The hash is what catches the third and nastiest no-data shape: a full-size, perfectly
    // valid image that is the SAME image everywhere. See the identical-bytes check below.
    return { status: res.status, size: imageSize(buf), bytes: buf.length, placeholder, hash: createHash("sha1").update(buf).digest("hex") };
  } catch (err) {
    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return probe(url, 1);
    }
    return { status: 0, error: String(err) };
  }
}

/**
 * Whether a 200 response is actually a picture of nothing.
 *
 * Three shapes, in rising order of nastiness: a tiny body, a PNG where the URL asked for a JPEG,
 * and — the one that hid for a while — a valid full-size image byte-identical to what the same
 * provider serves over open ocean at the same zoom. Land cannot legitimately look like the
 * mid-Pacific, so a hash match is proof of a placeholder, whatever the status code says.
 */
function isNoData(result, controlHash) {
  if (result.status !== 200) return false;
  return result.placeholder || (controlHash !== undefined && result.hash === controlHash);
}

const layers = readRegistry();
if (layers.length === 0) {
  console.error("Parsed no tiled Layers out of registry.ts — the file shape has changed.");
  process.exit(1);
}

const now = new Date();
let problems = 0;
console.log(`Probing ${layers.length} Layers at their declared maxzoom and one level above, and every time-aware Layer for freshness.\n`);

function report(p, errors, notes, detail) {
  if (errors.length > 0) problems += 1;
  const label = errors.length > 0 ? "FAIL" : "ok  ";
  console.log(`  ${label}  ${p.id.padEnd(30)} ${detail}`);
  for (const e of errors) console.log(`        ${e}`);
  if (errors.length === 0) for (const n of notes) console.log(`        note: ${n}`);
}

for (const p of layers) {
  if (p.requiresKey && !process.env[p.requiresKey]) {
    console.log(`  SKIP  ${p.id.padEnd(30)} (${p.requiresKey} not exported)`);
    continue;
  }

  // Only two conditions are actual problems, because the two directions are not symmetric. A
  // ceiling set too HIGH makes MapLibre request tiles that do not exist, so the pane blanks and
  // sprays 404s. A ceiling set too LOW just means MapLibre upsamples, so the pane goes blurry
  // and the overzoom badge says so — which for several Layers here is the deliberate choice,
  // because the server will happily upsample and pass interpolation off as detail. So "z+1 also
  // works" is reported as information, never as a failure.
  const errors = [];
  const notes = [];

  // 0. Freshness. Resolved first, because the tiles below are requested at the Time it finds.
  let freshness = "";
  if (p.time) {
    try {
      const domain = await timeDomain(p, now);
      p.resolvedTime = resolveTime(domain, undefined);
      if (!p.resolvedTime) errors.push("the service lists no Times at all");
      else {
        const ended = endedOn(domain, p.time, now);
        if (ended) errors.push(`stale: the newest picture is from ${formatTime(latestTime(domain), p.time.precision)}, far behind its cadence — the app marks it ended ${ended}`);
        freshness = `latest ${p.resolvedTime.time}`;
      }
    } catch (err) {
      errors.push(`cannot read its Times: ${err.message}`);
    }
  }

  // A STAC Layer's pictures are COGs, read by range requests rather than as tiles.
  if (p.kind === "stac") {
    if (p.resolvedTime) {
      const res = await fetch(p.resolvedTime.value, { headers: { Range: "bytes=0-1023", "User-Agent": "mapcompare-probe" } });
      if (res.status !== 206) errors.push(`the newest COG answers ${res.status} to a range request, not 206 — the browser cannot read it`);
      if (res.headers.get("access-control-allow-origin") === null) notes.push("the COG response carries no CORS header; check it from a browser");
    }
    report(p, errors, notes, freshness);
    continue;
  }
  if (!p.tile || (p.time && !p.resolvedTime)) {
    report(p, errors, notes, freshness);
    continue;
  }

  // A Layer that does not cover the whole Earth is checked where it does, and only there.
  const points = p.daylightOnly ? [subsolarPoint(Date.parse(p.resolvedTime.time))] : p.probePoint ? [p.probePoint] : POINTS;
  const coverageZoom = Math.min(COVERAGE_ZOOM, p.maxzoom);

  // 1. Coverage, checked at a LOW zoom at every point. Any layer claiming global reach must
  //    have something everywhere at z8. This is the check that separates a genuine coverage gap
  //    (Sentinel-2 cloudless 2017 outside Europe) from the ordinary sparsity of high-resolution
  //    imagery, which only shows up near a Layer's ceiling.
  const lowControl = await probe(buildUrl(p, coverageZoom, CONTROL));
  for (const point of points) {
    const low = await probe(buildUrl(p, coverageZoom, point));
    if (low.status !== 200) errors.push(`z${coverageZoom} at ${point.name} returns ${low.status} — no coverage where the registry implies reach`);
    else if (isNoData(low, lowControl.hash))
      errors.push(`z${coverageZoom} at ${point.name} returns a ${low.bytes}-byte no-data placeholder, not imagery — a 200, so no error handler can see it`);
  }

  // 2. The declared ceiling and tile size, checked at EVERY point against that Layer's own
  //    open-ocean no-data tile. Checking Amsterdam alone hid a real defect: Esri World Imagery
  //    served Amsterdam to z20 while handing Tokyo the grey "Map data not yet available" JPEG at
  //    the same zoom — full-size, valid, and a 200, so the pane went grey and nothing complained.
  //
  //    Away from the first point the two ways of running out of data are judged differently,
  //    because the app can only report one of them. A 404 reaches the pane as a "tiles missing"
  //    badge with the coverageNote in its tooltip, so for a Layer that HAS a coverageNote — a
  //    withdrawal of the claim to uniform reach — it is expected behaviour, not drift. A no-data
  //    200 reaches the pane as nothing at all, so it is a failure over populated ground however
  //    well documented. Only over the remote point does a declared coverageNote excuse it.
  const control = await probe(buildUrl(p, p.maxzoom, CONTROL));
  let at;
  for (const [i, point] of points.entries()) {
    const result = await probe(buildUrl(p, p.maxzoom, point));
    at ??= result;
    const declared = i > 0 && Boolean(p.coverageNote);
    if (result.status !== 200) {
      const line = `z${p.maxzoom} at ${point.name} returns ${result.status}`;
      if (declared) notes.push(`${line}; visibly missing rather than silently blank, as coverageNote says`);
      else errors.push(`${line} — declared ceiling is too HIGH`);
    } else if (isNoData(result, control.hash)) {
      const line = `z${p.maxzoom} at ${point.name} returns a ${result.bytes}-byte no-data placeholder, identical to this Layer's open-ocean tile`;
      if (declared && point.remote) notes.push(`${line}; coverage is thin there, as coverageNote says`);
      else errors.push(`${line} — a 200, so the pane goes blank with nothing to badge it`);
    } else if (result.size && result.size.w !== p.tileSize) {
      errors.push(`tileSize declared ${p.tileSize} but server returned ${result.size.w}x${result.size.h} at ${point.name} — layer will render one zoom level off`);
    }
  }
  const dims = at.size ? `${at.size.w}px` : "?";

  const aboveControl = await probe(buildUrl(p, p.maxzoom + 1, CONTROL));
  const above = await probe(buildUrl(p, p.maxzoom + 1, points[0]));
  if (above.status === 200 && !isNoData(above, aboveControl.hash)) notes.push(`z${p.maxzoom + 1} also serves; confirm whether that is real detail or server upsampling`);

  report(p, errors, notes, `z${p.maxzoom} ${dims}${freshness ? ` · ${freshness}` : ""}`);
}

console.log(problems === 0 ? "\nRegistry matches the live services." : `\n${problems} Layer(s) drifted from the registry in a way that breaks rendering or went stale.`);
process.exit(problems === 0 ? 0 : 1);
