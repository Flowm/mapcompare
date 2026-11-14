import { describe, expect, it } from "vitest";

import { stacItemTime, stacItemUrls, wmsTimeValues, wmtsTimeValues } from "./discovery";

/** Trimmed from GIBS' real capabilities: two layers, so the right block has to be found. */
const WMTS = `<Capabilities><Contents>
<Layer><ows:Title>Other</ows:Title><ows:Identifier>Other_Layer</ows:Identifier>
<Dimension><ows:Identifier>Time</ows:Identifier><Value>1999-01-01/1999-12-31/P1D</Value></Dimension></Layer>
<Layer><ows:Title>GOES-East</ows:Title><ows:Identifier>GOES-East_ABI_GeoColor</ows:Identifier>
<Dimension><ows:Identifier>Time</ows:Identifier><ows:UOM>ISO8601</ows:UOM><Default>2026-11-13T18:20:00Z</Default>
<Value>2026-08-11T02:40:00Z/2026-08-11T02:40:00Z/PT10M</Value><Value>2026-11-13T18:10:00Z/2026-11-13T18:20:00Z/PT10M</Value></Dimension>
<TileMatrixSetLink><TileMatrixSet>GoogleMapsCompatible_Level7</TileMatrixSet></TileMatrixSetLink></Layer>
<Layer><ows:Identifier>Static_Layer</ows:Identifier></Layer>
</Contents></Capabilities>`;

/** Trimmed from EUMETView's per-layer capabilities. */
const WMS = `<WMS_Capabilities><Capability><Layer><Name>rgb_geocolour</Name>
<Dimension name="time" default="2026-11-13T19:30:00Z" units="ISO8601" nearestValue="1">2024-09-23T00:00:00.000Z/2026-11-13T19:30:00.000Z/PT10M</Dimension>
</Layer></Capability></WMS_Capabilities>`;

describe("wmtsTimeValues", () => {
  it("reads the Time values of the named layer only", () => {
    expect(wmtsTimeValues(WMTS, "GOES-East_ABI_GeoColor")).toStrictEqual(["2026-08-11T02:40:00Z/2026-08-11T02:40:00Z/PT10M", "2026-11-13T18:10:00Z/2026-11-13T18:20:00Z/PT10M"]);
  });

  it("is undefined for a layer that is not there or has no Time", () => {
    expect(wmtsTimeValues(WMTS, "Missing")).toBeUndefined();
    expect(wmtsTimeValues(WMTS, "Static_Layer")).toBeUndefined();
  });
});

describe("wmsTimeValues", () => {
  it("finds a workspace-prefixed layer under its bare name", () => {
    expect(wmsTimeValues(WMS, "mtg_fd:rgb_geocolour")).toStrictEqual(["2024-09-23T00:00:00.000Z/2026-11-13T19:30:00.000Z/PT10M"]);
  });

  it("is undefined when the layer is not described", () => {
    expect(wmsTimeValues(WMS, "msg_fes:rgb_natural")).toBeUndefined();
  });

  it("never borrows the next layer's Times for a layer that has none", () => {
    const xml = `<Capability><Layer>
<Layer><Name>static_layer</Name><Title>No time</Title></Layer>
<Layer><Name>timed_layer</Name><Dimension name="time">2026-01-01/2026-01-02/P1D</Dimension></Layer>
</Layer></Capability>`;
    expect(wmsTimeValues(xml, "static_layer")).toBeUndefined();
    expect(wmsTimeValues(xml, "timed_layer")).toStrictEqual(["2026-01-01/2026-01-02/P1D"]);
  });
});

describe("STAC", () => {
  const collectionUrl = "https://s.test/geo/mosaic/collection.json";

  it("resolves item links against the collection and drops the duplicates a generator wrote", () => {
    const collection = {
      links: [
        { rel: "root", href: "../catalog.json" },
        { rel: "item", href: "./2026/11/13/a.json" },
        { rel: "item", href: "./2026/11/13/a.json" },
        { rel: "item", href: "https://other.test/b.json" },
      ],
    };
    expect(stacItemUrls(collection, collectionUrl)).toStrictEqual(["https://s.test/geo/mosaic/2026/11/13/a.json", "https://other.test/b.json"]);
  });

  it("reads an item's moment and its asset's absolute URL", () => {
    const item = { properties: { datetime: "2026-11-13T19:00:00Z" }, assets: { image: { href: "./a.tif" } } };
    expect(stacItemTime(item, "https://s.test/geo/mosaic/2026/11/13/a.json", "image")).toStrictEqual({
      datetime: "2026-11-13T19:00:00Z",
      href: "https://s.test/geo/mosaic/2026/11/13/a.tif",
    });
  });

  it("skips an item without the asset or a datetime", () => {
    expect(stacItemTime({ properties: {}, assets: { image: { href: "a.tif" } } }, collectionUrl, "image")).toBeUndefined();
    expect(stacItemTime({ properties: { datetime: "2026-11-13T19:00:00Z" }, assets: {} }, collectionUrl, "image")).toBeUndefined();
  });
});
