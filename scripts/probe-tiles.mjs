#!/usr/bin/env node
/**
 * Re-checks the registry's two riskiest fields against the live services: the measured
 * `maxzoom` ceiling and the `tileSize` in pixels.
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
 * Keyed providers are skipped unless the matching VITE_* var is exported into the shell.
 * Redirects are followed: Esri Wayback answers 301 for most tiles, pointing at whichever
 * release last changed that tile, which browsers follow transparently.
 */
import { readFileSync } from "node:fs";

/** Points chosen to sit inside each provider's real coverage. */
const AMSTERDAM = { lat: 52.373, lon: 4.893, name: "Amsterdam" };

/** id -> probe point. Everything unlisted uses Amsterdam, which all global layers cover. */
const POINTS = {};

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

/**
 * Pulls the provider table out of registry.ts without a TS toolchain: this script is plain
 * node, and the fields it needs are all literals.
 */
function readRegistry() {
  const src = readFileSync(new URL("../src/lib/providers/registry.ts", import.meta.url), "utf8");
  const providers = [];
  for (const [, block] of src.matchAll(/\{\s*\n\s{4}id: "([\s\S]*?)\n\s{2}\},\n/g)) {
    const body = block;
    const id = /^([\w.]+)"/.exec(body)?.[1];
    const kind = /kind: "(raster|style)"/.exec(body)?.[1];
    if (!id || kind !== "raster") continue;
    const tile = /tiles: \["([^"]+)"\]/.exec(body)?.[1];
    const tileSize = Number(/tileSize: (\d+)/.exec(body)?.[1]);
    const maxzoom = Number(/maxzoom: (\d+)/.exec(body)?.[1]);
    const requiresKey = /requiresKey: "(\w+)"/.exec(body)?.[1];
    const token = /token: "\{(\w+)\}"/.exec(body)?.[1];
    const firstValue = /values: \[\s*\{ value: "([^"]+)"/.exec(body)?.[1] ?? /\{ value: "([^"]+)"/.exec(body)?.[1];
    if (tile && tileSize && maxzoom) providers.push({ id, tile, tileSize, maxzoom, requiresKey, token, firstValue });
  }
  return providers;
}

function buildUrl(p, z) {
  const point = POINTS[p.id] ?? AMSTERDAM;
  const { x, y } = tileXY(point.lat, point.lon, z);
  let url = p.tile.replaceAll("{z}", String(z)).replaceAll("{x}", String(x)).replaceAll("{y}", String(y));
  if (p.requiresKey) url = url.replaceAll("{KEY}", process.env[p.requiresKey] ?? "");
  if (p.token) {
    // Dates are resolved to yesterday UTC; fixed lists use their first declared value.
    const value = p.token === "DATE" ? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10) : (p.firstValue ?? "");
    url = url.replaceAll(`{${p.token}}`, value);
  }
  return url;
}

async function probe(url) {
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "mapcompare-probe" } });
    if (!res.ok) return { status: res.status };
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, size: imageSize(buf), bytes: buf.length };
  } catch (err) {
    return { status: 0, error: String(err) };
  }
}

const providers = readRegistry();
if (providers.length === 0) {
  console.error("Parsed no raster providers out of registry.ts — the file shape has changed.");
  process.exit(1);
}

let problems = 0;
console.log(`Probing ${providers.length} raster providers at their declared maxzoom and one level above.\n`);

for (const p of providers) {
  if (p.requiresKey && !process.env[p.requiresKey]) {
    console.log(`  SKIP  ${p.id.padEnd(30)} (${p.requiresKey} not exported)`);
    continue;
  }

  const at = await probe(buildUrl(p, p.maxzoom));
  const above = await probe(buildUrl(p, p.maxzoom + 1));

  // Only two conditions are actual problems, because the two directions are not
  // symmetric. A ceiling set too HIGH makes MapLibre request tiles that do not exist, so
  // the pane blanks and sprays 404s. A ceiling set too LOW just means MapLibre upsamples,
  // so the pane goes blurry and the overzoom badge says so — which for several providers
  // here is the deliberate choice, because the server will happily upsample and pass
  // interpolation off as detail. So "z+1 also works" is reported as information, never as
  // a failure.
  const errors = [];
  if (at.status !== 200) errors.push(`maxzoom ${p.maxzoom} returns ${at.status} — declared ceiling is too HIGH, panes will blank`);
  else if (at.size && at.size.w !== p.tileSize) errors.push(`tileSize declared ${p.tileSize} but server returned ${at.size.w}x${at.size.h} — layer will render one zoom level off`);

  const info = above.status === 200 ? `z${p.maxzoom + 1} also serves; confirm whether that is real detail or server upsampling` : null;

  if (errors.length > 0) problems += 1;
  const label = errors.length > 0 ? "FAIL" : "ok  ";
  const dims = at.size ? `${at.size.w}px` : "?";
  console.log(`  ${label}  ${p.id.padEnd(30)} z${p.maxzoom}=${at.status} ${dims}  z${p.maxzoom + 1}=${above.status}`);
  for (const e of errors) console.log(`        ${e}`);
  if (info && errors.length === 0) console.log(`        note: ${info}`);
}

console.log(problems === 0 ? "\nRegistry matches the live services." : `\n${problems} provider(s) drifted from the registry in a way that breaks rendering.`);
process.exit(problems === 0 ? 0 : 1);
