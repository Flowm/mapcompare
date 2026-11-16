import { ADDED_LIMITS, ADDED_PROVIDER, type AddedLayer, addedLayerId, type Bbox, isHttpUrl, isTileTemplate, TIME_LABELS } from "./added";
import { stacItemUrls } from "./discovery";
import { parseTime } from "./time";
import type { Licence, LicenceTier, TimePrecision, TimeSpec } from "./types";

/**
 * Turning a URL into the Added Layers it can be: a tile template, a COG, or a STAC catalogue,
 * collection or item.
 *
 * Pure, like the rest of `lib/layers`: the network and the COG decoder arrive as `InspectDeps`, so
 * the same inspection runs against fixtures in tests. `api/addedLayers.ts` is the browser wiring.
 *
 * Inspection is bounded, because a STAC tree can be any size and one click must not fetch it all:
 * a fixed budget of documents for the whole walk, and a sample of items per collection. The panes
 * read a chosen collection's items in full later, through discovery.
 */

export interface CogInfo {
  /** The deepest zoom the file holds detail for, in 256 px tiles. */
  maxzoom: number;
  /** In degrees. */
  bbox?: Bbox;
}

export interface InspectDeps {
  fetchText(url: string): Promise<string>;
  cogInfo(url: string): Promise<CogInfo>;
}

/** One Layer a URL can become. A STAC catalogue usually offers several. */
export interface Candidate {
  layer: AddedLayer;
  /** What was found, in one line: "STAC collection · 24 items · asset image". */
  summary: string;
  /** Where the data is, so the camera can be sent there when it is not the whole Earth. */
  bbox?: Bbox;
}

export interface Inspection {
  candidates: Candidate[];
  /** The source had more than the walk's budget allowed reading; only the first ones are offered. */
  partial: boolean;
}

/**
 * The whole walk's budget: catalogue and collection documents fetched, collections inspected, and
 * how deep. With each inspected collection costing its sample, one inspection stays near a hundred
 * requests however large the tree is. A bigger tree wants a STAC API.
 */
export const WALK = { documents: 30, collections: 10, depth: 3 } as const;

/** Items read per collection: for its Times' spacing, and for credits that name more than one source. */
const SAMPLE_ITEMS = 6;

// ------------------------------------------------------------------------------ STAC shapes

interface StacLink {
  rel?: string;
  href?: string;
  datetime?: unknown;
}

interface StacAsset {
  href?: unknown;
  type?: unknown;
  title?: unknown;
  roles?: unknown;
}

interface StacDoc {
  type?: unknown;
  id?: unknown;
  title?: unknown;
  description?: unknown;
  license?: unknown;
  providers?: unknown;
  links?: StacLink[];
  assets?: Record<string, StacAsset>;
  item_assets?: Record<string, StacAsset>;
  bbox?: unknown;
  extent?: { spatial?: { bbox?: unknown } };
  properties?: Record<string, unknown> & { datetime?: unknown; title?: unknown };
}

/** A STAC document and where it was read from, which every relative link in it is resolved against. */
interface StacSource {
  doc: StacDoc;
  url: string;
}

async function read(url: string, deps: InspectDeps): Promise<StacSource> {
  return { doc: JSON.parse(await deps.fetchText(url)) as StacDoc, url };
}

// --------------------------------------------------------------------------------- helpers

function isTiffUrl(url: string): boolean {
  return /\.tiff?(?:$|[?#])/i.test(url);
}

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function fileName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.split("/").pop() || hostOf(url));
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** What a STAC document calls itself: an item's title, a collection's, else its id, else its file. */
function titleOf({ doc, url }: StacSource): string {
  return clip(stringOr(doc.properties?.title ?? doc.title, stringOr(doc.id, fileName(url))), ADDED_LIMITS.label);
}

/** A Layer's name: the document's title, and the asset's when there is more than one to tell apart. */
function assetLabel(title: string, keys: readonly string[], key: string, asset: StacAsset | undefined): string {
  return clip(keys.length > 1 ? `${title} · ${stringOr(asset?.title, key)}` : title, ADDED_LIMITS.label);
}

/** The first sentence, short enough for a catalogue row. */
function noteFrom(description: unknown, fallback: string): string {
  if (typeof description !== "string" || description.trim() === "") return fallback;
  return clip(description.trim().split(/(?<=\.)\s/)[0]!, 200);
}

function isBbox(value: unknown): value is Bbox {
  return Array.isArray(value) && value.length === 4 && value.every((n) => typeof n === "number" && Number.isFinite(n));
}

function bboxOf(doc: StacDoc): Bbox | undefined {
  const spatial = doc.extent?.spatial?.bbox;
  if (Array.isArray(spatial) && isBbox(spatial[0])) return spatial[0];
  return isBbox(doc.bbox) ? doc.bbox : undefined;
}

function rolesOf(asset: StacAsset): string[] {
  return Array.isArray(asset.roles) ? asset.roles.filter((r): r is string => typeof r === "string") : [];
}

function datetimeOf(doc: StacDoc): string | undefined {
  return typeof doc.properties?.datetime === "string" ? doc.properties.datetime : undefined;
}

// --------------------------------------------------------------------------- credit & terms

/** Where the URL came from, as a credit: the floor when a source names nobody. */
function hostCredit(url: string): string {
  const parsed = new URL(url);
  return `<a href="${escapeHtml(parsed.origin)}">${escapeHtml(parsed.host)}</a>`;
}

interface StacProvider {
  name?: unknown;
  url?: unknown;
}

/** STAC's own providers list, else the host the data came from. */
export function stacAttribution({ doc, url }: StacSource): string {
  const named = (Array.isArray(doc.providers) ? (doc.providers as StacProvider[]) : []).filter(
    (p): p is { name: string; url?: unknown } => typeof p?.name === "string" && p.name.trim() !== "",
  );
  if (named.length === 0) return hostCredit(url);
  return named.map((p) => (typeof p.url === "string" && isHttpUrl(p.url) ? `<a href="${escapeHtml(p.url)}">${escapeHtml(p.name)}</a>` : escapeHtml(p.name))).join(", ");
}

/**
 * Credits an item states for itself, beyond its collection's providers: STAC has no standard field,
 * so any `attribution` or extension `*:attribution` property, as a string or a list. The satvis
 * mosaic names EUMETSAT there, whose CC BY credit is required.
 *
 * A credit that names the item's own year names the year of the picture shown instead, as `{YEAR}`.
 */
export function itemCredits(item: StacDoc): string[] {
  const year = datetimeOf(item)?.slice(0, 4);
  const values = Object.entries(item.properties ?? {})
    .filter(([key]) => key === "attribution" || key.endsWith(":attribution"))
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => escapeHtml(v.trim()))
    .map((v) => (year && /^\d{4}$/.test(year) ? v.replaceAll(new RegExp(`\\b${year}\\b`, "g"), "{YEAR}") : v));
  return [...new Set(values)];
}

/**
 * What an SPDX id lets you do. Only the clear cases are judged: anything else, including STAC's
 * own `other` and `proprietary`, is `unknown` and the chip says to check.
 */
export function licenceTierFor(spdx: string | undefined): LicenceTier {
  if (!spdx) return "unknown";
  if (/-NC\b/i.test(spdx)) return "restricted";
  if (/^(CC-BY(-SA)?-\d|CC0-|PDDL-|ODbL-|ODC-BY-|OGL-|etalab-)/i.test(spdx)) return "open";
  return "unknown";
}

function stacLicence({ doc, url }: StacSource): Licence {
  const spdx = typeof doc.license === "string" ? doc.license : undefined;
  const linked = doc.links?.find((l) => l.rel === "license" && typeof l.href === "string")?.href;
  const named = spdx && !["other", "proprietary", "various"].includes(spdx.toLowerCase());
  return {
    tier: licenceTierFor(spdx),
    note: named ? `The source states ${spdx}.` : "The source states no licence this app can read. Check its terms before reusing anything.",
    url: linked ? new URL(linked, url).href : named ? `https://spdx.org/licenses/${spdx}.html` : url,
  };
}

function unknownLicence(url: string): Licence {
  return { tier: "unknown", note: "Added by URL, with no licence this app can read. Check the source's terms before reusing anything.", url: new URL(url).origin };
}

// --------------------------------------------------------------------------------- Times

/**
 * How finely Times are told apart, from the Times themselves: midnight everywhere is days,
 * the first of January everywhere is years.
 */
export function precisionOf(times: readonly number[]): TimePrecision {
  if (times.length === 0) return "minute";
  const dates = times.map((t) => new Date(t));
  if (!dates.every((d) => d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0)) return "minute";
  return dates.every((d) => d.getUTCMonth() === 0 && d.getUTCDate() === 1) ? "year" : "day";
}

const STEP_FOR: Record<TimePrecision, number> = { minute: 60, day: 24 * 60, year: 365 * 24 * 60 };

/**
 * The Time spec a STAC Layer needs before anything has been fetched: its precision, and a step for
 * its Cadence. The Times themselves are always asked of the catalogue.
 */
export function stacTimeSpec(datetimes: readonly string[]): TimeSpec {
  const times = datetimes
    .map((d) => parseTime(d.replace(/(\.\d+)?(Z|[+-]00:00)$/, "Z")))
    .filter((t): t is number => t !== undefined)
    .toSorted((a, b) => a - b);
  const precision = precisionOf(times);
  const gaps = times
    .slice(1)
    .map((t, i) => (t - times[i]!) / 60_000)
    .filter((g) => g > 0)
    .toSorted((a, b) => a - b);
  const stepMinutes = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)]! : STEP_FOR[precision];
  return { precision, label: TIME_LABELS[precision], series: { stepMinutes } };
}

// ------------------------------------------------------------------------------ candidates

/**
 * The assets a pane can draw: GeoTIFFs, by media type or by name. A thumbnail or an overview is
 * never what someone means to compare. Visual assets first, since that is the picture.
 */
export function cogAssetKeys(assets: Record<string, StacAsset> | undefined): string[] {
  const keys = Object.entries(assets ?? {})
    .filter(([, a]) => {
      const tiff = (typeof a.type === "string" && a.type.includes("image/tiff")) || (typeof a.href === "string" && isTiffUrl(a.href));
      const roles = rolesOf(a);
      return tiff && !roles.includes("thumbnail") && !roles.includes("overview");
    })
    .map(([key]) => key);
  const visual = (key: string) => (rolesOf(assets![key]!).includes("visual") || key === "visual" ? 0 : 1);
  return keys.toSorted((a, b) => visual(a) - visual(b));
}

export function xyzCandidate(template: string): Candidate {
  return {
    layer: {
      id: addedLayerId("xyz", template),
      kind: "xyz",
      label: clip(hostOf(template), ADDED_LIMITS.label),
      provider: ADDED_PROVIDER,
      category: "basemap",
      note: `Tiles from ${hostOf(template)}, added by URL.`,
      attribution: hostCredit(template),
      licence: unknownLicence(template),
      tiles: [template],
      tileSize: 256,
      minzoom: 0,
      // A guess the form lets the user correct: nothing in a template says how deep it goes.
      maxzoom: 19,
    },
    summary: "XYZ tile template · check the tile size and max zoom",
  };
}

export async function cogCandidate(url: string, deps: InspectDeps): Promise<Candidate> {
  const info = await deps.cogInfo(url);
  return {
    layer: {
      id: addedLayerId("cog", url),
      kind: "cog",
      label: clip(fileName(url), ADDED_LIMITS.label),
      provider: ADDED_PROVIDER,
      category: "basemap",
      note: `A Cloud-Optimised GeoTIFF from ${hostOf(url)}, added by URL.`,
      attribution: hostCredit(url),
      licence: unknownLicence(url),
      url,
      minzoom: 0,
      maxzoom: Math.min(ADDED_LIMITS.maxZoom, Math.max(ADDED_LIMITS.minZoom, info.maxzoom)),
    },
    summary: `Cloud-Optimised GeoTIFF · detail to z${info.maxzoom}`,
    bbox: info.bbox,
  };
}

function itemCandidates(item: StacSource, deps: InspectDeps): Promise<Candidate[]> {
  const keys = cogAssetKeys(item.doc.assets);
  const title = titleOf(item);
  return Promise.all(
    keys.map(async (key) => {
      const asset = item.doc.assets![key]!;
      const candidate = await cogCandidate(new URL(asset.href as string, item.url).href, deps);
      return {
        layer: {
          ...candidate.layer,
          label: assetLabel(title, keys, key, asset),
          note: noteFrom(item.doc.description, candidate.layer.note),
          attribution: [...itemCredits(item.doc), stacAttribution(item)].join(" · "),
          licence: stacLicence(item),
        },
        summary: `STAC item · asset ${key} · detail to z${candidate.layer.maxzoom}`,
        bbox: bboxOf(item.doc) ?? candidate.bbox,
      };
    }),
  );
}

interface ItemLink {
  url: string;
  /** STAC 1.1 lets a link carry its item's datetime, which saves fetching the item. */
  datetime?: string;
}

function itemLinks({ doc, url }: StacSource): ItemLink[] {
  const datetimes = new Map<string, string>();
  for (const l of doc.links ?? []) {
    if (l.rel === "item" && typeof l.href === "string" && typeof l.datetime === "string") datetimes.set(new URL(l.href, url).href, l.datetime);
  }
  return stacItemUrls(doc, url).map((itemUrl) => ({ url: itemUrl, datetime: datetimes.get(itemUrl) }));
}

/**
 * A collection (or a catalogue that lists items itself) whose items are its Times, one Layer per
 * drawable asset. The newest item stands for the rest: its assets are what is offered and its COG is
 * measured for the zoom ceiling. Credits come from the newest few items together, so a credit the
 * newest happens to lack — a disk missing from that one mosaic — is still given.
 *
 * Without datetimes on the links, "newest" is the last item listed, the same assumption the panes'
 * discovery makes, and the Times' spacing comes from the sampled items.
 */
async function collectionCandidates(collection: StacSource, deps: InspectDeps): Promise<Candidate[]> {
  const links = itemLinks(collection);
  if (links.length === 0) return [];
  const dated = links.every((l) => l.datetime !== undefined);
  const ordered = dated ? links.toSorted((a, b) => Date.parse(a.datetime!) - Date.parse(b.datetime!)) : links;

  // Newest first, so the newest item's credits lead and its failure is the one that fails the collection.
  const [newest, ...others] = ordered.slice(-SAMPLE_ITEMS).toReversed();
  const item = await read(newest!.url, deps);
  // An item listed but already deleted is a normal state for a rolling archive.
  const rest = await Promise.all(others.map((l) => read(l.url, deps).catch(() => undefined)));
  const sample = [item, ...rest.filter((s): s is StacSource => s !== undefined)];

  const keys = cogAssetKeys(item.doc.assets ?? collection.doc.item_assets);
  if (keys.length === 0) return [];

  const time = stacTimeSpec(dated ? ordered.map((l) => l.datetime!) : sample.flatMap((s) => datetimeOf(s.doc) ?? []));
  const credits = [...new Set(sample.flatMap((s) => itemCredits(s.doc)))];
  const title = titleOf(collection);
  const base = {
    provider: ADDED_PROVIDER,
    note: noteFrom(collection.doc.description, `A STAC collection from ${hostOf(collection.url)}, added by URL.`),
    attribution: [...credits, stacAttribution(collection)].join(" · "),
    licence: stacLicence(collection),
  };

  // Satellite, even with one item: each item is a moment, so the collection shows when.
  return Promise.all(
    keys.map(async (key): Promise<Candidate> => {
      const asset = item.doc.assets?.[key];
      const info = asset && typeof asset.href === "string" ? await deps.cogInfo(new URL(asset.href, item.url).href) : undefined;
      const maxzoom = Math.min(ADDED_LIMITS.maxZoom, Math.max(ADDED_LIMITS.minZoom, info?.maxzoom ?? 18));
      return {
        layer: {
          ...base,
          id: addedLayerId("stac", collection.url, key),
          kind: "stac",
          label: assetLabel(title, keys, key, asset),
          category: "satellite",
          collection: collection.url,
          asset: key,
          minzoom: 0,
          maxzoom,
          time,
        },
        summary: `STAC collection · ${links.length} ${links.length === 1 ? "item" : "items"} · asset ${key} · detail to z${maxzoom}`,
        bbox: bboxOf(collection.doc) ?? info?.bbox,
      };
    }),
  );
}

function childUrls({ doc, url }: StacSource): string[] {
  return (doc.links ?? []).filter((l) => l.rel === "child" && typeof l.href === "string").map((l) => new URL(l.href!, url).href);
}

interface Walk {
  deps: InspectDeps;
  root: StacSource;
  seen: Set<string>;
  documents: number;
  collections: number;
  partial: boolean;
}

/**
 * A catalogue's collections, breadth first, within the walk's budget. Errors from the root itself
 * reach the user; a broken child is skipped, so it cannot hide its siblings.
 */
async function walkCatalog(root: StacSource, deps: InspectDeps): Promise<Inspection> {
  const walk: Walk = { deps, root, seen: new Set([root.url]), documents: 1, collections: 0, partial: false };
  const candidates = await walkLevel([root], 0, walk);
  return { candidates, partial: walk.partial };
}

/** One level of the walk: its collections, then the next level down, until the budget or the tree runs out. */
async function walkLevel(level: readonly StacSource[], depth: number, walk: Walk): Promise<Candidate[]> {
  const listing = level.filter((s) => itemLinks(s).length > 0);
  const inspect = listing.slice(0, WALK.collections - walk.collections);
  walk.collections += inspect.length;
  walk.partial ||= inspect.length < listing.length;
  const found = (await Promise.all(inspect.map((s) => (s === walk.root ? collectionCandidates(s, walk.deps) : collectionCandidates(s, walk.deps).catch(() => []))))).flat();

  // A collection's own child links are not followed: its items are what it offers.
  const unseen = [...new Set(level.filter((s) => s.doc.type !== "Collection").flatMap(childUrls))].filter((u) => !walk.seen.has(u));
  if (unseen.length === 0) return found;
  if (depth >= WALK.depth) {
    walk.partial = true;
    return found;
  }
  const next = unseen.slice(0, WALK.documents - walk.documents);
  walk.partial ||= next.length < unseen.length;
  walk.documents += next.length;
  next.forEach((u) => walk.seen.add(u));
  const docs = await Promise.all(next.map((u) => read(u, walk.deps).catch(() => undefined)));
  const below = docs.filter((s): s is StacSource => s !== undefined);
  return below.length === 0 ? found : [...found, ...(await walkLevel(below, depth + 1, walk))];
}

/**
 * Everything a URL can be drawn as: a tile template, a COG, or a STAC catalogue, collection or
 * item. Throws with a sentence for the user when it is none of them.
 */
export async function inspectUrl(raw: string, deps: InspectDeps): Promise<Inspection> {
  const url = raw.trim();
  if (!URL.canParse(url)) throw new Error("That is not a URL.");
  if (!isHttpUrl(url)) throw new Error("Only http and https URLs can be added.");

  if (isTileTemplate(url)) return { candidates: [xyzCandidate(url)], partial: false };
  if (isTiffUrl(url)) return { candidates: [await cogCandidate(url, deps)], partial: false };

  let source: StacSource;
  try {
    source = await read(url, deps);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("This is not JSON, so not a STAC document. A COG URL should end in .tif.", { cause: error });
    throw error;
  }
  if (typeof source.doc !== "object" || source.doc === null || !["Catalog", "Collection", "Feature"].includes(source.doc.type as string)) {
    throw new Error("This JSON is not a STAC catalogue, collection or item.");
  }
  const found = source.doc.type === "Feature" ? { candidates: await itemCandidates(source, deps), partial: false } : await walkCatalog(source, deps);
  if (found.candidates.length === 0) throw new Error("No drawable GeoTIFF asset found. STAC API collections, which page their items, are not supported yet.");
  return found;
}
