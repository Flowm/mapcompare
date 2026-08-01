/**
 * Jump-to locations, each chosen because it makes some difference between providers obvious.
 *
 * A generic "notable places" list would be useless here: the point is to land somewhere that
 * answers a question — how much resolution does this provider actually have, how old is its
 * imagery, does it cope with snow, does it hide clouds.
 *
 * A preset moves the CAMERA AND NOTHING ELSE. It deliberately carries no layer information:
 * you pick what to compare, and the place picker is how you take that comparison somewhere
 * else. Swapping the panes out from under a chosen pairing destroys the comparison the user
 * was in the middle of making, which is the one thing this app is for.
 */
export interface Preset {
  name: string;
  /** What this location exposes. Shown in the menu; this is the reason the entry exists. */
  why: string;
  lat: number;
  lon: number;
  zoom: number;
}

export const PRESETS: readonly Preset[] = [
  {
    name: "Amsterdam, Dam",
    why: "Dutch national orthophoto ground truth; the widest resolution spread between providers anywhere",
    lat: 52.373,
    lon: 4.893,
    zoom: 16,
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
    why: "Everyone's reference frame, and the widest vintage spread in the Wayback archive",
    lat: 40.758,
    lon: -73.9855,
    zoom: 16,
  },
  {
    name: "Dubai, Palm Jumeirah",
    why: "A coastline built from nothing — spectacular across any dated archive's back catalogue",
    lat: 25.1122,
    lon: 55.139,
    zoom: 14,
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
    why: "The canonical change-detection site: a sea that left, and is still leaving between vintages",
    lat: 43.7681,
    lon: 59.0219,
    zoom: 9,
  },
  {
    name: "Lake Mead, Hoover Dam",
    why: "Water level dates a layer instantly — the best 'how old is this imagery?' test",
    lat: 36.016,
    lon: -114.7377,
    zoom: 13,
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
