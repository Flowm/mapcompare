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
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

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
    // `\s*` because the formatter wraps a long note onto its own line, and a coverageNote that
    // reads as absent silently turns documented patchiness back into a hard failure.
    const coverageNote = /coverageNote:\s*"/.test(body);
    const token = /token: "\{(\w+)\}"/.exec(body)?.[1];
    const variantKind = /variant: \{ kind: "(\w+)"/.exec(body)?.[1];
    // The LAST declared value, because that is what the app shows. `defaultVariant` resolves
    // "latest" to `values.at(-1)`, and the registry keeps values oldest-first — so probing the
    // first one verified a vintage nobody sees while leaving the default unchecked. EOX was
    // verified at 2018 and shipped defaulting to 2025; Wayback at a 2014 release and shipped on a
    // 2024 one.
    const values = [...body.matchAll(/\{ value: "([^"]+)"/g)].map((m) => m[1]);
    const defaultValue = values.at(-1);
    if (tile && tileSize && maxzoom) providers.push({ id, tile, tileSize, maxzoom, requiresKey, token, variantKind, defaultValue, coverageNote });
  }
  return providers;
}

function buildUrl(p, z, point) {
  const { x, y } = tileXY(point.lat, point.lon, z);
  let url = p.tile.replaceAll("{z}", String(z)).replaceAll("{x}", String(x)).replaceAll("{y}", String(y));
  if (p.requiresKey) url = url.replaceAll("{KEY}", process.env[p.requiresKey] ?? "");
  if (p.token) {
    // Keyed off `kind`, not off the token's name: a date provider using some token other than
    // {DATE} used to fall through to the fixed-list branch, produce an empty substitution and fail
    // for a reason that had nothing to do with the endpoint.
    // Both branches mirror `variants.defaultVariant`, so what is probed is what the app requests.
    const value = p.variantKind === "date" ? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10) : (p.defaultValue ?? "");
    url = url.replaceAll(`{${p.token}}`, value);
  }
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

  // Only two conditions are actual problems, because the two directions are not symmetric. A
  // ceiling set too HIGH makes MapLibre request tiles that do not exist, so the pane blanks and
  // sprays 404s. A ceiling set too LOW just means MapLibre upsamples, so the pane goes blurry
  // and the overzoom badge says so — which for several providers here is the deliberate choice,
  // because the server will happily upsample and pass interpolation off as detail. So "z+1 also
  // works" is reported as information, never as a failure.
  const errors = [];
  const notes = [];

  // 1. Coverage, checked at a LOW zoom at every point. Any layer claiming global reach must
  //    have something everywhere at z8. This is the check that separates a genuine coverage gap
  //    (Sentinel-2 cloudless 2017 outside Europe) from the ordinary sparsity of high-resolution
  //    imagery, which only shows up near a provider's ceiling.
  const lowControl = await probe(buildUrl(p, COVERAGE_ZOOM, CONTROL));
  for (const point of POINTS) {
    const low = await probe(buildUrl(p, COVERAGE_ZOOM, point));
    if (low.status !== 200) errors.push(`z${COVERAGE_ZOOM} at ${point.name} returns ${low.status} — no coverage where the registry implies global reach`);
    else if (isNoData(low, lowControl.hash))
      errors.push(`z${COVERAGE_ZOOM} at ${point.name} returns a ${low.bytes}-byte no-data placeholder, not imagery — a 200, so no error handler can see it`);
  }

  // 2. The declared ceiling and tile size, checked at EVERY point against that provider's own
  //    open-ocean no-data tile. Checking Amsterdam alone hid a real defect: Esri World Imagery
  //    served Amsterdam to z20 while handing Tokyo the grey "Map data not yet available" JPEG at
  //    the same zoom — full-size, valid, and a 200, so the pane went grey and nothing complained.
  //
  //    A ceiling set too high makes MapLibre request tiles that are missing, so panes blank. Too
  //    low merely upsamples, which several providers here declare deliberately, so "z+1 also
  //    works" is information, never a failure.
  //
  //    Away from Amsterdam the two ways of running out of data are judged differently, because
  //    the app can only report one of them. A 404 reaches the pane as a "tiles missing" badge
  //    with the coverageNote in its tooltip, so for a provider that HAS a coverageNote — a
  //    withdrawal of the claim to uniform reach — it is expected behaviour, not drift. A no-data
  //    200 reaches the pane as nothing at all, so it is a failure over populated ground however
  //    well documented: an honest ceiling is one the user's city actually has imagery at. Only
  //    over the remote point, where high-resolution imagery genuinely thins out everywhere, does
  //    a declared coverageNote excuse it.
  const control = await probe(buildUrl(p, p.maxzoom, CONTROL));
  let at;
  for (const [i, point] of POINTS.entries()) {
    const result = await probe(buildUrl(p, p.maxzoom, point));
    at ??= result;
    const declared = i > 0 && Boolean(p.coverageNote);
    if (result.status !== 200) {
      const line = `z${p.maxzoom} at ${point.name} returns ${result.status}`;
      if (declared) notes.push(`${line}; visibly missing rather than silently blank, as coverageNote says`);
      else errors.push(`${line} — declared ceiling is too HIGH`);
    } else if (isNoData(result, control.hash)) {
      const line = `z${p.maxzoom} at ${point.name} returns a ${result.bytes}-byte no-data placeholder, identical to this provider's open-ocean tile`;
      if (declared && point.remote) notes.push(`${line}; coverage is thin there, as coverageNote says`);
      else errors.push(`${line} — a 200, so the pane goes blank with nothing to badge it`);
    } else if (result.size && result.size.w !== p.tileSize) {
      errors.push(`tileSize declared ${p.tileSize} but server returned ${result.size.w}x${result.size.h} at ${point.name} — layer will render one zoom level off`);
    }
  }
  const dims = at.size ? `${at.size.w}px` : "?";

  const aboveControl = await probe(buildUrl(p, p.maxzoom + 1, CONTROL));
  const above = await probe(buildUrl(p, p.maxzoom + 1, POINTS[0]));
  if (above.status === 200 && !isNoData(above, aboveControl.hash)) notes.push(`z${p.maxzoom + 1} also serves; confirm whether that is real detail or server upsampling`);

  if (errors.length > 0) problems += 1;
  const label = errors.length > 0 ? "FAIL" : "ok  ";
  console.log(`  ${label}  ${p.id.padEnd(30)} z${p.maxzoom} ${dims}`);
  for (const e of errors) console.log(`        ${e}`);
  if (errors.length === 0) for (const n of notes) console.log(`        note: ${n}`);
}

console.log(problems === 0 ? "\nRegistry matches the live services." : `\n${problems} provider(s) drifted from the registry in a way that breaks rendering.`);
process.exit(problems === 0 ? 0 : 1);
