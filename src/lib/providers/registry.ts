import type { PaneLayer, Provider } from "./types";
import { WAYBACK_LATEST, WAYBACK_RELEASES } from "./waybackReleases";

/**
 * The basemap catalogue.
 *
 * Every `maxzoom` here was established by requesting a real tile at a point known to be
 * covered, then walking the zoom up until the server 404s — NOT by reading documentation.
 * Documented ceilings lie: VersaTiles' own TileJSON advertises 19 and stops at 17.
 *
 * Every `tileSize` was established by reading the pixel dimensions out of a returned tile.
 * This is the most dangerous field in the file, because a wrong value renders plausible
 * imagery one zoom level off instead of failing.
 *
 * `pnpm run probe-tiles` re-checks both against the live services.
 *
 * Licence tiers are not decoration. Three sharp edges are encoded here deliberately:
 *   - Esri's keyless endpoints are licensed for use inside ArcGIS products, not here.
 *     `arcgis.imagery` is the licensed route to the same imagery.
 *   - Sentinel-2 cloudless is CC BY-NC-SA 4.0: non-commercial AND share-alike.
 *   - Mapbox bills per tile request via MapLibre and requires their wordmark.
 */

const OSM = '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Esri's copyright text, taken verbatim from the service metadata. */
const ESRI_WORLD_IMAGERY = 'Source: <a href="https://www.esri.com/">Esri</a>, Vantor, Earthstar Geographics, and the GIS User Community';
const ESRI_CLARITY = 'Source: <a href="https://www.esri.com/">Esri</a>, Vantor, Earthstar Geographics, IGN, and the GIS User Community';
const GIBS = 'Imagery: <a href="https://worldview.earthdata.nasa.gov/">NASA EOSDIS GIBS</a> / LANCE';

/** Esri's keyless services work, but are licensed for use with ArcGIS Online/Enterprise. */
const ESRI_TERMS = {
  tier: "terms",
  note: "Esri licenses these endpoints for use inside ArcGIS Online and ArcGIS Enterprise, and not for commercial use here. Set an ArcGIS API key to use the same imagery on terms that cover you.",
  url: "https://www.esri.com/en-us/legal/terms/full-master-agreement",
} as const;

const PUBLIC_DOMAIN = {
  tier: "open",
  note: "Public domain. NASA imagery carries no reuse restrictions; the credit is a courtesy.",
  url: "https://www.earthdata.nasa.gov/engage/open-data-services-software-policies",
} as const;

const METERED = (freeTier: string) =>
  ({
    tier: "metered",
    note: `Every tile you load is billed against your own key. Free allowance: ${freeTier}.`,
    url: "",
  }) as const;

export const PROVIDERS: readonly Provider[] = [
  // ---------------------------------------------------------------- global, keyless, open
  {
    id: "versatiles.satellite",
    label: "VersaTiles Satellite",
    operator: "VersaTiles",
    kind: "raster",
    // Absolute template on purpose. Do NOT point MapLibre at the TileJSON: /tiles/satellite
    // returns 500, and /tiles/satellite/tiles.json declares a RELATIVE `tiles` array.
    tiles: ["https://tiles.versatiles.org/tiles/satellite/{z}/{x}/{y}"],
    tileSize: 512,
    minzoom: 0,
    // TileJSON claims 19. Measured: z18 404s over Amsterdam, Vienna and Zermatt, and z13
    // 404s over San Francisco, Tokyo, Dubai and Sydney. The high-res layer is a mosaic of
    // European national orthophotos; everything else falls back to ~10 m Sentinel-2, which
    // runs out around z12. Declaring 17 keeps Europe sharp and lets the tile-error badge
    // explain the rest rather than MapLibre spraying 404s.
    maxzoom: 17,
    coverageNote: "8-50 cm across Europe, ~10 m elsewhere. Expect missing tiles above z12 outside Europe.",
    note: "European national orthophotos over a global Sentinel-2 fallback. The only keyless layer here that is safe for commercial use.",
    attribution: '<a href="https://versatiles.org/sources/">VersaTiles sources</a>',
    licence: {
      tier: "open",
      note: "Every source in the mosaic is CC BY 4.0, CC0, DL-DE or another open government licence. Reuse freely with the credit shown.",
      url: "https://versatiles.org/sources/",
    },
  },

  // ------------------------------------------------------- global, keyless, licence caveat
  {
    id: "esri.imagery",
    label: "Esri World Imagery",
    operator: "Esri",
    kind: "raster",
    // {z}/{y}/{x} is Esri's ArcGIS tile path order. This is NOT TMS — the y axis still
    // counts from the top, so `scheme` must stay at its xyz default.
    tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    tileSize: 256,
    minzoom: 0,
    // Deliberately below what the server will hand out. Esri answers 200 all the way to
    // z23, but over Amsterdam the z22 and z23 responses are byte-identical, i.e. pure
    // server-side upsampling of ~30 cm pixels. 20 is the honest native ceiling, and letting
    // MapLibre upsample past it puts the overzoom factor in the pane badge instead of
    // passing off interpolation as detail.
    maxzoom: 20,
    note: "30 cm-1 m commercial imagery worldwide, 15 cm in some cities. The de facto reference everyone compares against.",
    attribution: ESRI_WORLD_IMAGERY,
    licence: ESRI_TERMS,
  },
  {
    id: "esri.clarity",
    label: "Esri World Imagery (Clarity)",
    operator: "Esri",
    kind: "raster",
    tiles: ["https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    tileSize: 256,
    minzoom: 0,
    // A genuine hard ceiling, unlike World Imagery above: z21 returns 404.
    maxzoom: 20,
    note: "The same archive with a different vintage selection — often a sharper or older frame than World Imagery over the same ground.",
    attribution: ESRI_CLARITY,
    licence: ESRI_TERMS,
  },
  {
    id: "esri.wayback",
    label: "Esri Wayback",
    operator: "Esri",
    kind: "raster",
    // {RELEASE} is an OPAQUE INTEGER, not a date — see waybackReleases.ts.
    //
    // Probing this with `curl` without -L looks broken: most releases answer 301 for most
    // tiles, because Wayback redirects to whichever release last *changed* that tile. The
    // redirect carries `Access-Control-Allow-Origin: *` and a 24 h Cache-Control, and
    // browsers follow it transparently. Verified: release 4756 -> 11060 -> 200 image/jpeg.
    // This is correct behaviour. Do not "fix" it.
    tiles: ["https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/{RELEASE}/{z}/{y}/{x}"],
    tileSize: 256,
    minzoom: 0,
    // Same archive and same upsampling behaviour as esri.imagery above.
    maxzoom: 20,
    note: "A time machine over World Imagery: one dated snapshot per year back to 2014. Put two years in two panes and watch a city get built.",
    attribution: ESRI_WORLD_IMAGERY,
    licence: ESRI_TERMS,
    variant: {
      kind: "release",
      token: "{RELEASE}",
      values: WAYBACK_RELEASES,
      default: WAYBACK_LATEST,
      label: "Snapshot",
    },
  },
  {
    id: "eox.s2cloudless",
    label: "Sentinel-2 cloudless",
    operator: "EOX",
    kind: "raster",
    tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-{YEAR}_3857/default/g/{z}/{y}/{x}.jpg"],
    tileSize: 256,
    minzoom: 0,
    // The WMTS capabilities declare tile matrices 0-14, and 14 is where 10 m pixels
    // genuinely run out. EOX will answer 200 at z15 by upsampling; declaring 14 keeps the
    // overzoom honest and visible in the pane badge.
    maxzoom: 14,
    note: "10 m cloud-free annual composite, eight vintages from 2018. Genuinely global and genuinely cloud-free, which no commercial layer here manages.",
    // EOX require this wording verbatim, with the year of the composite substituted.
    attribution: 'EOxCloudless {YEAR} <a href="https://cloudless.eox.at">cloudless.eox.at</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data {YEAR})',
    licence: {
      tier: "restricted",
      note: "CC BY-NC-SA 4.0. Non-commercial use only, and derivatives must share alike. A commercial licence is available from EOX.",
      url: "https://cloudless.eox.at/documentation/license",
    },
    variant: {
      kind: "year",
      token: "{YEAR}",
      // Measured: 2016 404s outright, and 2017 exists but covers EUROPE ONLY. Everywhere else
      // it answers 200 with a 116-byte fully transparent PNG — note the PNG, even though the
      // request asks for .jpg. That renders as an empty pane indistinguishable from a broken
      // one, and because the status is 200 no tile-error handler can catch it, so 2017 is left
      // out rather than shipped as a trap. 2018 onwards are genuinely global (verified at the
      // Aral Sea, Lake Mead, Nebraska, the Congo Basin and the Sahara).
      values: [
        { value: "2018", label: "2018" },
        { value: "2019", label: "2019" },
        { value: "2020", label: "2020" },
        { value: "2021", label: "2021" },
        { value: "2022", label: "2022" },
        { value: "2023", label: "2023" },
        { value: "2024", label: "2024" },
        { value: "2025", label: "2025" },
      ],
      default: "latest",
      label: "Vintage",
    },
  },

  // ------------------------------------------------ global, daily, low-res, public domain
  {
    id: "gibs.viirs.noaa20",
    label: "VIIRS NOAA-20 true colour",
    operator: "NASA GIBS",
    kind: "raster",
    tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/{DATE}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg"],
    tileSize: 256,
    minzoom: 0,
    // "Level9" means nine matrices, 0-8 — but the service does serve z9 and rejects z10.
    // Measured, not inferred from the name.
    maxzoom: 9,
    note: "Yesterday's Earth at 375 m. Clouds, smoke plumes and dust storms exactly as they were, which every other layer here deliberately hides.",
    vintage: "daily",
    attribution: GIBS,
    licence: PUBLIC_DOMAIN,
    variant: { kind: "date", token: "{DATE}", earliest: "2018-01-01", default: "latest", label: "Date" },
  },
  {
    id: "gibs.modis.terra",
    label: "MODIS Terra true colour",
    operator: "NASA GIBS",
    kind: "raster",
    tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{DATE}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg"],
    tileSize: 256,
    minzoom: 0,
    maxzoom: 9,
    note: "The same idea at 250 m, but the archive reaches back to February 2000.",
    vintage: "daily",
    attribution: GIBS,
    licence: PUBLIC_DOMAIN,
    variant: { kind: "date", token: "{DATE}", earliest: "2000-02-24", default: "latest", label: "Date" },
  },

  // ------------------------------------------------------------------------ global, keyed
  {
    id: "mapbox.satellite",
    label: "Mapbox Satellite",
    operator: "Mapbox",
    kind: "raster",
    tiles: ["https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token={KEY}"],
    // @2x returns 512 px tiles. Getting this wrong scales the whole layer by 2.
    tileSize: 512,
    minzoom: 0,
    // UNVERIFIED: no key was available when this was written, so this is a deliberately
    // conservative floor rather than Mapbox's documented ceiling of 22. Too low renders
    // blurry (harmless); too high renders blank (not harmless). Raise it once
    // `pnpm run probe-tiles` can run with a real key.
    maxzoom: 19,
    note: "Global imagery down to 15 cm in places, served as retina 512 px tiles.",
    attribution: `© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © ${OSM}`,
    logo: "/logos/mapbox.svg",
    licence: {
      ...METERED("750,000 raster tile requests/month"),
      url: "https://www.mapbox.com/legal/tos",
      note: "Consumed through MapLibre rather than Mapbox GL JS, each tile request bills individually under the Maps API instead of bundling into a cheaper map load. Free allowance: 750,000 requests/month. Mapbox's terms also require their wordmark, which is why it is shown.",
    },
    requiresKey: "VITE_MAPBOX_TOKEN",
    keyUrl: "https://console.mapbox.com/account/access-tokens/",
    freeTier: "750k requests/month",
  },
  {
    id: "maptiler.satellite",
    label: "MapTiler Satellite",
    operator: "MapTiler",
    kind: "style",
    styleUrl: "https://api.maptiler.com/maps/satellite/style.json?key={KEY}",
    minzoom: 0,
    // Advisory only for style providers — the real limits come from the fetched style.
    // Drives the zoom-fit badge.
    maxzoom: 20,
    note: "Global ~50 cm imagery, colour-balanced more aggressively than Esri's.",
    attribution: `© <a href="https://www.maptiler.com/copyright/">MapTiler</a> © ${OSM}`,
    licence: { ...METERED("100,000 requests/month"), url: "https://www.maptiler.com/terms/" },
    requiresKey: "VITE_MAPTILER_KEY",
    keyUrl: "https://cloud.maptiler.com/account/keys/",
    freeTier: "100k requests/month, no card",
  },
  {
    id: "stadia.alidade_satellite",
    label: "Stadia Alidade Satellite",
    operator: "Stadia Maps",
    kind: "raster",
    tiles: ["https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}@2x.jpg?api_key={KEY}"],
    tileSize: 512,
    minzoom: 0,
    maxzoom: 20,
    note: "30 cm imagery over 37M km2, warm-graded. The best-looking layer here, if not always the most literal.",
    attribution: `© <a href="https://stadiamaps.com/">Stadia Maps</a> © <a href="https://openmaptiles.org/">OpenMapTiles</a> © ${OSM}`,
    licence: {
      tier: "restricted",
      note: "Free for development and non-commercial use, including academic. Commercial use needs a paid plan.",
      url: "https://stadiamaps.com/terms-of-service/",
    },
    requiresKey: "VITE_STADIA_API_KEY",
    keyUrl: "https://client.stadiamaps.com/dashboard/",
    freeTier: "free for non-commercial use",
  },
  {
    id: "arcgis.imagery",
    label: "ArcGIS Imagery (licensed)",
    operator: "Esri",
    kind: "style",
    styleUrl: "https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/arcgis/imagery?token={KEY}",
    minzoom: 0,
    maxzoom: 19,
    note: "The same Esri imagery as the keyless entries above, but on a licence that actually covers you. One free signup.",
    attribution: `Powered by <a href="https://www.esri.com/">Esri</a> — ${ESRI_WORLD_IMAGERY}`,
    licence: {
      tier: "licensed",
      note: "Used under your own ArcGIS Location Platform licence. This is the correct route to Esri imagery outside ArcGIS products.",
      url: "https://www.esri.com/en-us/legal/terms/full-master-agreement",
    },
    requiresKey: "VITE_ARCGIS_API_KEY",
    keyUrl: "https://location.arcgis.com/",
    freeTier: "monthly free allowance, no card",
  },
  {
    id: "here.satellite",
    label: "HERE Satellite",
    operator: "HERE",
    kind: "raster",
    tiles: ["https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/jpeg?style=satellite.day&apiKey={KEY}"],
    tileSize: 512,
    minzoom: 0,
    maxzoom: 20,
    note: "A fourth independent global imagery stack, useful mainly as a tie-breaker when Esri and Mapbox disagree.",
    attribution: '© <a href="https://legal.here.com/terms">HERE</a>',
    licence: { ...METERED("30,000 requests/month on the Base plan"), url: "https://legal.here.com/terms" },
    requiresKey: "VITE_HERE_API_KEY",
    keyUrl: "https://platform.here.com/",
    // The no-credit-card Limited plan was retired 2025-08-31, making this the
    // highest-friction key in the catalogue.
    freeTier: "30k requests/month, credit card required",
  },

  // -------------------------------------------------------------------- reference, vector
  {
    id: "openfreemap.liberty",
    label: "OpenFreeMap Liberty",
    operator: "OpenFreeMap",
    kind: "style",
    styleUrl: "https://tiles.openfreemap.org/styles/liberty",
    minzoom: 0,
    maxzoom: 14,
    note: "Not imagery at all — a conventional OSM vector map, for reference when you need to know what you are looking at.",
    attribution: `<a href="https://openfreemap.org/">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> Data from ${OSM}`,
    licence: {
      tier: "open",
      note: "Open data under ODbL, served free with no key and no usage limits.",
      url: "https://openfreemap.org/",
    },
  },
];

export const PROVIDER_IDS: ReadonlySet<string> = new Set(PROVIDERS.map((p) => p.id));

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * Seeds panes that have never been chosen, and backfills when the pane count grows.
 *
 * Panes 1 and 2 are both keyless, so a fresh clone with no .env renders a real comparison
 * on first paint. Amsterdam at z16 sits inside both of their measured ceilings, so nothing
 * is blank, and the resolution gap between them is obvious without any explanatory copy.
 */
export const DEFAULT_PANE_LAYERS: readonly PaneLayer[] = [
  { providerId: "versatiles.satellite" },
  { providerId: "esri.imagery" },
  { providerId: "eox.s2cloudless" },
  { providerId: "esri.wayback" },
];
