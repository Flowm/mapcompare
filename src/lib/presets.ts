import type { PaneLayer } from "./providers/types";

/**
 * Jump-to locations, each chosen because it makes some difference between providers obvious.
 *
 * A generic "notable places" list would be useless here: the point is to land somewhere that
 * answers a question — how much resolution does this provider actually have, how old is its
 * imagery, does it cope with snow, does it hide clouds.
 */
export interface Preset {
  name: string;
  /** What this location exposes. Shown in the menu; this is the reason the entry exists. */
  why: string;
  lat: number;
  lon: number;
  zoom: number;
  /** An optional pane pairing that makes the point immediately. */
  suggests?: readonly PaneLayer[];
}

export const PRESETS: readonly Preset[] = [
  {
    name: "Amsterdam, Dam",
    why: "Dutch orthophoto against commercial imagery — the resolution story in one screen",
    lat: 52.373,
    lon: 4.893,
    zoom: 16,
    suggests: [{ providerId: "versatiles.satellite" }, { providerId: "esri.imagery" }],
  },
  {
    name: "Munich, Marienplatz",
    why: "Dense European core inside the high-res European mosaic; the best test of the label overlay",
    lat: 48.1374,
    lon: 11.5755,
    zoom: 16,
  },
  {
    name: "Manhattan, Midtown",
    why: "Everyone's reference frame, and a wide vintage spread across Wayback snapshots",
    lat: 40.758,
    lon: -73.9855,
    zoom: 16,
    suggests: [{ providerId: "esri.wayback" }, { providerId: "esri.imagery" }],
  },
  {
    name: "Dubai, Palm Jumeirah",
    why: "A coastline built from nothing — spectacular across Wayback's twelve years",
    lat: 25.1122,
    lon: 55.139,
    zoom: 14,
    suggests: [{ providerId: "esri.wayback", variant: "5844" }, { providerId: "esri.imagery" }],
  },
  {
    name: "Matterhorn, Zermatt",
    why: "Deep shadow, snow and extreme relief; exposes orthorectification quality",
    lat: 45.9766,
    lon: 7.6585,
    zoom: 14,
  },
  {
    name: "Aral Sea, Muynak",
    why: "The canonical change-detection pair: a sea that left",
    lat: 43.7681,
    lon: 59.0219,
    zoom: 9,
    suggests: [
      { providerId: "eox.s2cloudless", variant: "2018" },
      { providerId: "eox.s2cloudless", variant: "2025" },
    ],
  },
  {
    name: "Lake Mead, Hoover Dam",
    why: "Water level dates a layer instantly — the best 'how old is this imagery?' test",
    lat: 36.016,
    lon: -114.7377,
    zoom: 13,
    suggests: [
      { providerId: "eox.s2cloudless", variant: "2018" },
      { providerId: "eox.s2cloudless", variant: "2025" },
    ],
  },
  {
    name: "Novo Progresso, Brazil",
    why: "A deforestation front, where clearing edges move visibly between vintages",
    lat: -7.15,
    lon: -55.4,
    zoom: 11,
  },
  {
    name: "Centre pivots, Nebraska",
    why: "Circular fields make season of capture and crop stage instantly legible",
    lat: 41.3,
    lon: -101,
    zoom: 12,
  },
  {
    name: "Tibesti, Sahara",
    why: "Bare desert: nothing but colour balance, and where Esri falls back to 15 m TerraColor",
    lat: 20.5,
    lon: 17.5,
    zoom: 10,
  },
  {
    name: "Kisangani, Congo Basin",
    why: "Persistently cloudy — the case cloudless composites exist for",
    // z9 rather than closer in: VIIRS tops out there natively, and cloud cover is a regional
    // phenomenon anyway, so a wide view is the honest way to show it.
    lat: 0.515,
    lon: 25.19,
    zoom: 9,
    suggests: [{ providerId: "gibs.viirs.noaa20" }, { providerId: "eox.s2cloudless" }],
  },
  {
    name: "Venice",
    why: "Water colour and tidal state differ wildly between sources",
    lat: 45.434,
    lon: 12.339,
    zoom: 16,
  },
  {
    name: "Tokyo, Shinjuku",
    why: "Dense urban at the top of most providers' zoom range",
    lat: 35.69,
    lon: 139.7,
    zoom: 17,
  },
];
