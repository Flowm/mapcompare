import type { Layer, StacLayer, TimeValue, WmsLayer, WmtsLayer } from "./types";

/**
 * Reading a service's own account of which Times it has.
 *
 * Parsers over documents fetched by whoever calls them — the app (`api/discovery.ts`) and
 * `scripts/probe-tiles.mjs` alike, which is why nothing here imports anything at runtime: Node runs
 * this file directly with its types stripped. Plain string scanning rather than DOMParser: GIBS'
 * capabilities are 5.8 MB describing 1,330 layers of which we want one, and this has to run in
 * Node, where there is no DOM.
 */

/** Most items a STAC collection is read for. A static catalogue past this needs a STAC API. */
export const STAC_ITEM_LIMIT = 500;

export type DiscoverableLayer = WmtsLayer | WmsLayer | StacLayer;

export function canDiscover(layer: Layer): layer is DiscoverableLayer {
  return layer.kind === "wmts" || layer.kind === "wms" || layer.kind === "stac";
}

export function wmsCapabilitiesUrl(url: string): string {
  return `${url}?service=WMS&version=1.3.0&request=GetCapabilities`;
}

/**
 * A GetMap request per tile, at the tile's own Web Mercator bbox. MapLibre fills
 * `{bbox-epsg-3857}` itself, so a WMS needs no tiling service in front of it.
 */
export function wmsTemplate(layer: WmsLayer): string {
  const params = [
    "service=WMS",
    "version=1.3.0",
    "request=GetMap",
    `layers=${layer.layers}`,
    "styles=",
    "crs=EPSG:3857",
    "bbox={bbox-epsg-3857}",
    `width=${layer.tileSize}`,
    `height=${layer.tileSize}`,
    "format=image/png",
    "transparent=true",
    ...(layer.time ? ["time={TIME}"] : []),
  ];
  return `${layer.url}?${params.join("&")}`;
}

function between(doc: string, from: number, open: string, close: string): string | undefined {
  const start = doc.indexOf(open, from);
  if (start === -1) return undefined;
  const end = doc.indexOf(close, start + open.length);
  return end === -1 ? undefined : doc.slice(start + open.length, end);
}

/** The `<Layer>` block that declares `identifier`, in a WMTS capabilities document. */
function wmtsLayerBlock(xml: string, identifier: string): string | undefined {
  const at = xml.indexOf(`<ows:Identifier>${identifier}</ows:Identifier>`);
  if (at === -1) return undefined;
  const start = xml.lastIndexOf("<Layer>", at);
  const end = xml.indexOf("</Layer>", at);
  return start === -1 || end === -1 ? undefined : xml.slice(start, end);
}

/**
 * The Time dimension's values for one WMTS layer: `start/end/period` runs and single dates.
 * Undefined when the document does not describe the layer or gives it no Time dimension.
 */
export function wmtsTimeValues(xml: string, identifier: string): string[] | undefined {
  const block = wmtsLayerBlock(xml, identifier);
  if (!block) return undefined;
  for (let from = 0; ;) {
    const dimStart = block.indexOf("<Dimension>", from);
    if (dimStart === -1) return undefined;
    const dimEnd = block.indexOf("</Dimension>", dimStart);
    const dim = block.slice(dimStart, dimEnd === -1 ? undefined : dimEnd);
    const id = between(dim, 0, "<ows:Identifier>", "</ows:Identifier>");
    if (id?.toLowerCase() === "time") return [...dim.matchAll(/<Value>([^<]*)<\/Value>/g)].map((m) => m[1]!.trim());
    from = dimStart + 1;
  }
}

/**
 * The time dimension of a WMS layer. `name` may carry a workspace prefix (`mtg_fd:rgb_geocolour`);
 * GeoServer's per-layer capabilities name it without one.
 */
export function wmsTimeValues(xml: string, name: string): string[] | undefined {
  const bare = name.includes(":") ? name.slice(name.indexOf(":") + 1) : name;
  let at = xml.indexOf(`<Name>${name}</Name>`);
  if (at === -1) at = xml.indexOf(`<Name>${bare}</Name>`);
  if (at === -1) return undefined;
  // Only this layer's own elements: they end where a child layer starts or this one closes. A
  // layer without a time dimension must not borrow the next layer's.
  const ends = [xml.indexOf("<Layer", at), xml.indexOf("</Layer>", at)].filter((i) => i !== -1);
  const own = xml.slice(at, ends.length > 0 ? Math.min(...ends) : undefined);
  const match = /<Dimension\b[^>]*\bname="time"[^>]*>([^<]*)<\/Dimension>/i.exec(own);
  return match
    ? match[1]!
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v !== "")
    : undefined;
}

interface StacLink {
  rel?: string;
  href?: string;
}

/** The item documents a static STAC collection links to, absolute and without duplicates. */
export function stacItemUrls(collection: unknown, collectionUrl: string): string[] {
  const links = (collection as { links?: StacLink[] } | null)?.links ?? [];
  const urls = links.filter((l) => l.rel === "item" && typeof l.href === "string").map((l) => new URL(l.href!, collectionUrl).href);
  return [...new Set(urls)];
}

export interface StacItemTime {
  datetime: string;
  href: string;
}

/** One item's moment and the absolute URL of the asset to draw, or undefined if it has neither. */
export function stacItemTime(item: unknown, itemUrl: string, asset: string): StacItemTime | undefined {
  const doc = item as { properties?: { datetime?: unknown }; assets?: Record<string, { href?: unknown }> } | null;
  const datetime = doc?.properties?.datetime;
  const href = doc?.assets?.[asset]?.href;
  if (typeof datetime !== "string" || typeof href !== "string") return undefined;
  return { datetime, href: new URL(href, itemUrl).href };
}

/** What a service says about its Times, before it becomes a domain. */
export type DiscoveredTimes = { intervals: string[] } | { values: TimeValue[] };

/**
 * Asks a Layer's service which Times it has, through whatever `fetchText` the caller supplies.
 * Undefined when the service does not describe the Layer at all.
 */
export async function discoverTimes(layer: DiscoverableLayer, fetchText: (url: string) => Promise<string>): Promise<DiscoveredTimes | undefined> {
  if (layer.kind === "wmts") {
    const intervals = wmtsTimeValues(await fetchText(layer.capabilities), layer.layer);
    return intervals ? { intervals } : undefined;
  }
  if (layer.kind === "wms") {
    const intervals = wmsTimeValues(await fetchText(layer.capabilities ?? wmsCapabilitiesUrl(layer.url)), layer.layers);
    return intervals ? { intervals } : undefined;
  }
  const urls = stacItemUrls(JSON.parse(await fetchText(layer.collection)), layer.collection).slice(-STAC_ITEM_LIMIT);
  // An item listed but already deleted is a normal state for a rolling archive, not a failure.
  const items = await Promise.all(
    urls.map((url) =>
      fetchText(url)
        .then((doc) => stacItemTime(JSON.parse(doc), url, layer.asset))
        .catch(() => undefined),
    ),
  );
  return { values: items.flatMap((i) => (i ? [{ time: i.datetime, param: i.href }] : [])) };
}
