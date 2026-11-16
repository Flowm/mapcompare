import { ADDED_LIMITS, ADDED_PROVIDER, type AddedLayer, addedLayerId, isHttpUrl, isTileTemplate, TIME_LABELS } from "./added";
import { CATEGORY_LABELS } from "./availability";
import { LICENCE_TIERS } from "./licence";
import type { Category, LicenceTier, TimePrecision } from "./types";

/**
 * Added Layers as they are kept and shared: rebuilt from untrusted input (storage and links), and
 * written into a link. Pure; see `added.ts` for what an Added Layer is.
 */

const KINDS = new Set(["stac", "cog", "xyz"]);
// Derived from the maps that must already name every member, so a new tier, Category or precision
// needs no edit here.
const CATEGORIES = new Set<string>(Object.keys(CATEGORY_LABELS));
const TIERS = new Set<string>(Object.keys(LICENCE_TIERS));
const PRECISIONS = new Set<string>(Object.keys(TIME_LABELS));

function boundedText(value: unknown, max: number = ADDED_LIMITS.text): string | undefined {
  return typeof value === "string" && value.trim() !== "" && value.length <= max ? value : undefined;
}

function httpUrl(value: unknown): string | undefined {
  const raw = boundedText(value);
  return raw !== undefined && isHttpUrl(raw) ? raw : undefined;
}

function zoom(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= ADDED_LIMITS.minZoom && value <= ADDED_LIMITS.maxZoom ? value : undefined;
}

/**
 * An Added Layer rebuilt field by field from untrusted input — storage, a shared link, or the add
 * form — or undefined if it is not one. Rebuilt rather than checked and passed through, so nothing
 * the registry trusts (`requiresKey`, `wordmark`, a foreign id) can ride along. The id is derived
 * from the source again, so a Layer is always filed under the id its source would get.
 */
export function normaliseAddedLayer(raw: unknown): AddedLayer | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const l = raw as Record<string, unknown> & { licence?: Record<string, unknown>; time?: { precision?: unknown; series?: { stepMinutes?: unknown } } };
  const label = boundedText(l.label, ADDED_LIMITS.label);
  const note = boundedText(l.note);
  const attribution = boundedText(l.attribution);
  const maxzoom = zoom(l.maxzoom);
  const tier = l.licence?.tier;
  const licenceNote = boundedText(l.licence?.note);
  const licenceUrl = httpUrl(l.licence?.url);
  if (!KINDS.has(l.kind as string) || !CATEGORIES.has(l.category as string) || !TIERS.has(tier as string)) return undefined;
  if (!label || !note || !attribution || maxzoom === undefined || !licenceNote || !licenceUrl) return undefined;

  const common = {
    label,
    provider: ADDED_PROVIDER,
    category: l.category as Category,
    note,
    attribution,
    licence: { tier: tier as LicenceTier, note: licenceNote, url: licenceUrl },
    minzoom: 0,
    maxzoom,
  };

  if (l.kind === "stac") {
    const collection = httpUrl(l.collection);
    const asset = boundedText(l.asset);
    const precision = l.time?.precision;
    const step = l.time?.series?.stepMinutes;
    if (!collection || !asset || !PRECISIONS.has(precision as string) || typeof step !== "number" || !(step > 0)) return undefined;
    const p = precision as TimePrecision;
    return {
      ...common,
      id: addedLayerId("stac", collection, asset),
      kind: "stac",
      collection,
      asset,
      time: { precision: p, label: TIME_LABELS[p], series: { stepMinutes: step } },
    };
  }
  if (l.kind === "cog") {
    const url = httpUrl(l.url);
    return url ? { ...common, id: addedLayerId("cog", url), kind: "cog", url } : undefined;
  }
  const template = Array.isArray(l.tiles) ? httpUrl(l.tiles[0]) : undefined;
  if (!template || !isTileTemplate(template) || (l.tileSize !== 256 && l.tileSize !== 512)) return undefined;
  return { ...common, id: addedLayerId("xyz", template), kind: "xyz", tiles: [template], tileSize: l.tileSize };
}

/**
 * Added Layers read back from storage, keeping only entries that still are one. Storage is written
 * by an older build or by hand as often as by this one, and a malformed Layer in the catalogue would
 * break every surface that lists it.
 */
export function parseStoredLayers(raw: unknown): AddedLayer[] {
  if (!Array.isArray(raw)) return [];
  // Keyed by the re-derived id, so two entries from one source collapse into the later one.
  const byId = new Map(raw.flatMap((entry) => normaliseAddedLayer(entry) ?? []).map((l) => [l.id, l]));
  return [...byId.values()];
}

function toBase64Url(value: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(token: string): string {
  const base64 = token.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "===".slice((base64.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/**
 * One Added Layer as a URL token: its definition, so a link shows the recipient the same Layer
 * without them adding it first. Base64url JSON, because the definition is mostly URLs and prose
 * that percent-encoding would roughly double; it has no `,`, which separates tokens. The id,
 * Provider, minzoom and Time label are left out because each follows from the rest.
 */
export function encodeAddedLayer(layer: AddedLayer): string {
  const { id: _id, provider: _provider, minzoom: _minzoom, ...rest } = layer;
  const wire = rest.kind === "stac" ? { ...rest, time: { precision: rest.time.precision, series: rest.time.series } } : rest;
  return toBase64Url(JSON.stringify(wire));
}

/** Undefined for anything that does not decode to a valid Added Layer: a link is untrusted input. */
export function decodeAddedLayer(token: string): AddedLayer | undefined {
  try {
    return normaliseAddedLayer(JSON.parse(fromBase64Url(token)));
  } catch {
    return undefined;
  }
}
