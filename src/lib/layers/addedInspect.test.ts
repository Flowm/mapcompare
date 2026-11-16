import { describe, expect, it } from "vitest";

import { cogAssetKeys, type Candidate, type InspectDeps, inspectUrl, licenceTierFor, precisionOf, stacTimeSpec, WALK } from "./addedInspect";
import { cadenceOf } from "./time";

const ROOT = "https://data.example/geo-test";

/** The shape of satvis' geo-test catalogue: a catalogue, one collection, hourly items. */
const DOCS: Record<string, unknown> = {
  [`${ROOT}/catalog.json`]: {
    type: "Catalog",
    id: "georing",
    links: [
      { rel: "root", href: "./catalog.json" },
      { rel: "child", href: "./mosaic/collection.json" },
      { rel: "child", href: "./broken/collection.json" },
    ],
  },
  [`${ROOT}/mosaic/collection.json`]: {
    type: "Collection",
    id: "mosaic",
    description: "The satellites' views of one Slot joined on one global grid. More words here.",
    license: "CC-BY-4.0",
    providers: [{ name: "satvis", url: "https://satvis.space/" }, { name: "<b>NOAA</b>" }],
    extent: { spatial: { bbox: [[-180, -85.0511, 180, 85.0511]] } },
    links: [
      { rel: "item", href: "./2026/11/15/a.json" },
      { rel: "item", href: "./2026/11/15/b.json" },
      { rel: "item", href: "./2026/11/15/c.json" },
    ],
  },
  ...Object.fromEntries(
    ["a", "b", "c"].map((name, i) => [
      `${ROOT}/mosaic/2026/11/15/${name}.json`,
      {
        type: "Feature",
        id: name,
        properties: {
          datetime: `2026-11-15T${17 + i}:00:00Z`,
          "georing:attribution": ["Contains modified EUMETSAT Meteosat data 2026", "Contains modified EUMETSAT Meteosat data 2026", "GOES: NOAA"],
        },
        assets: {
          thumbnail: { href: "./thumb.tif", type: "image/tiff", roles: ["thumbnail"] },
          image: { href: `./${name}.tif`, type: "image/tiff; application=geotiff; profile=cloud-optimized", roles: ["data", "visual"] },
          metadata: { href: "./meta.json", type: "application/json" },
        },
      },
    ]),
  ),
};

/** Just the candidates, for the tests that do not care whether the walk was cut short. */
async function inspect(url: string, with_: InspectDeps = deps): Promise<Candidate[]> {
  return (await inspectUrl(url, with_)).candidates;
}

const deps: InspectDeps = {
  fetchText: async (url) => {
    const doc = DOCS[url];
    if (doc === undefined) throw new Error(`404 ${url}`);
    return JSON.stringify(doc);
  },
  cogInfo: async () => ({ maxzoom: 8, bbox: [-180, -85, 180, 85] }),
};

describe("inspectUrl", () => {
  it("walks a catalogue down to its collection, skipping a broken child", async () => {
    const [candidate, ...rest] = await inspect(`${ROOT}/catalog.json`, deps);
    expect(rest).toHaveLength(0);
    expect(candidate!.layer).toMatchObject({
      kind: "stac",
      collection: `${ROOT}/mosaic/collection.json`,
      asset: "image",
      provider: "added",
      category: "satellite",
      maxzoom: 8,
      label: "mosaic",
      note: "The satellites' views of one Slot joined on one global grid.",
      licence: { tier: "open" },
    });
    expect(candidate!.layer.id).toMatch(/^added\.[a-z0-9]+$/);
    expect(candidate!.summary).toContain("3 items");
  });

  it("derives an hourly, minute-precise Time spec from the items", async () => {
    const [candidate] = await inspect(`${ROOT}/mosaic/collection.json`, deps);
    const time = candidate!.layer.time!;
    expect(time.precision).toBe("minute");
    expect(time.series?.stepMinutes).toBe(60);
    expect(cadenceOf(time)).toBe("sub-daily");
  });

  it("credits the newest item's own attribution, naming the year of the picture shown, then the providers escaped", async () => {
    const [candidate] = await inspect(`${ROOT}/mosaic/collection.json`, deps);
    expect(candidate!.layer.attribution).toBe('Contains modified EUMETSAT Meteosat data {YEAR} · GOES: NOAA · <a href="https://satvis.space/">satvis</a>, &lt;b&gt;NOAA&lt;/b&gt;');
  });

  it("samples a few items for the Times' spacing instead of reading every one", async () => {
    const BIG = "https://data.example/big/collection.json";
    const items = Array.from({ length: 400 }, (_, i) => `https://data.example/big/${i}.json`);
    const fetched: string[] = [];
    const big: InspectDeps = {
      ...deps,
      fetchText: async (url) => {
        fetched.push(url);
        if (url === BIG) return JSON.stringify({ type: "Collection", id: "big", links: items.map((href) => ({ rel: "item", href })) });
        const i = items.indexOf(url);
        return JSON.stringify({
          type: "Feature",
          properties: { datetime: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() },
          assets: { visual: { href: "v.tif", roles: ["visual"] } },
        });
      },
    };
    const [candidate] = await inspect(BIG, big);
    expect(new Set(fetched).size).toBeLessThanOrEqual(8);
    expect(candidate!.summary).toContain("400 items");
    expect(candidate!.layer.time).toMatchObject({ precision: "day", series: { stepMinutes: 24 * 60 } });
  });

  it("reads Times from the links when STAC 1.1 dates them, and takes the latest as newest wherever it is listed", async () => {
    const DATED = "https://data.example/dated/collection.json";
    const fetched: string[] = [];
    const dated: InspectDeps = {
      ...deps,
      fetchText: async (url) => {
        fetched.push(url);
        if (url === DATED)
          return JSON.stringify({
            type: "Collection",
            id: "dated",
            links: [
              { rel: "item", href: "./b.json", datetime: "2026-11-15T19:00:00Z" },
              { rel: "item", href: "./a.json", datetime: "2026-11-15T17:00:00Z" },
              { rel: "item", href: "./c.json", datetime: "2026-11-15T18:00:00Z" },
            ],
          });
        return JSON.stringify({ type: "Feature", properties: {}, assets: { image: { href: "./x.tif", type: "image/tiff" } } });
      },
    };
    const [candidate] = await inspect(DATED, dated);
    // The newest, by its link's date rather than its place in the list, is read first.
    expect(fetched.slice(0, 2)).toStrictEqual([DATED, "https://data.example/dated/b.json"]);
    expect(candidate!.layer.time).toMatchObject({ precision: "minute", series: { stepMinutes: 60 } });
  });

  it("offers each drawable asset of a single item as a COG", async () => {
    const candidates = await inspect(`${ROOT}/mosaic/2026/11/15/c.json`, deps);
    expect(candidates.map((c) => c.layer)).toMatchObject([{ kind: "cog", url: `${ROOT}/mosaic/2026/11/15/c.tif` }]);
  });

  it("takes a .tif URL as a COG without fetching it as JSON", async () => {
    const [candidate] = await inspect("https://cogs.example/scene.tif", deps);
    expect(candidate!.layer).toMatchObject({ kind: "cog", url: "https://cogs.example/scene.tif", label: "scene.tif", licence: { tier: "unknown" } });
  });

  it("takes a template with all three placeholders as XYZ tiles", async () => {
    const [candidate] = await inspect("https://tiles.example/{z}/{y}/{x}.png", deps);
    expect(candidate!.layer).toMatchObject({ kind: "xyz", tiles: ["https://tiles.example/{z}/{y}/{x}.png"], tileSize: 256 });
  });

  it("says what is wrong rather than failing quietly", async () => {
    await expect(inspect("not a url", deps)).rejects.toThrow("not a URL");
    await expect(inspect("ftp://x.example/a.json", deps)).rejects.toThrow("http");
    await expect(inspect(`${ROOT}/missing.json`, deps)).rejects.toThrow("404");
    await expect(inspect(`${ROOT}/plain.json`, { ...deps, fetchText: async () => '{"hello":1}' })).rejects.toThrow("not a STAC");
    await expect(inspect(`${ROOT}/page.html`, { ...deps, fetchText: async () => "<html>" })).rejects.toThrow("not JSON");
  });

  it("gives the same source the same id, so adding it twice replaces it", async () => {
    const [a] = await inspect(`${ROOT}/catalog.json`, deps);
    const [b] = await inspect(`${ROOT}/mosaic/collection.json`, deps);
    expect(a!.layer.id).toBe(b!.layer.id);
  });

  it("credits what any sampled item names, not only the newest", async () => {
    const MIXED = "https://data.example/mixed/collection.json";
    const credits: Record<string, string[]> = { new: ["GOES: NOAA"], old: ["GOES: NOAA", "Contains modified EUMETSAT Meteosat data 2025"] };
    const mixed: InspectDeps = {
      ...deps,
      fetchText: async (url) => {
        if (url === MIXED)
          return JSON.stringify({
            type: "Collection",
            id: "mixed",
            links: [
              { rel: "item", href: "./old.json" },
              { rel: "item", href: "./new.json" },
            ],
          });
        const name = url.endsWith("new.json") ? "new" : "old";
        const datetime = name === "new" ? "2026-01-01T01:00:00Z" : "2025-12-31T23:00:00Z";
        return JSON.stringify({ type: "Feature", properties: { datetime, "georing:attribution": credits[name] }, assets: { image: { href: "./x.tif", type: "image/tiff" } } });
      },
    };
    const [candidate] = await inspect(MIXED, mixed);
    expect(candidate!.layer.attribution).toBe('GOES: NOAA · Contains modified EUMETSAT Meteosat data {YEAR} · <a href="https://data.example">data.example</a>');
  });
});

describe("walking a catalogue", () => {
  /** A catalogue `fanout` wide at every level, `depth` deep, with a collection of three items at every leaf. */
  function tree(fanout: number, depth: number): { deps: InspectDeps; fetched: string[] } {
    const fetched: string[] = [];
    const fetchText = async (url: string) => {
      fetched.push(url);
      const path = new URL(url).pathname;
      if (path.endsWith("item.json"))
        return JSON.stringify({ type: "Feature", properties: { datetime: "2026-01-01T00:00:00Z" }, assets: { image: { href: "./x.tif", type: "image/tiff" } } });
      const level = path.split("/").length - 2;
      if (level >= depth) return JSON.stringify({ type: "Collection", id: path, links: [0, 1, 2].map((i) => ({ rel: "item", href: `./${i}/item.json` })) });
      return JSON.stringify({ type: "Catalog", id: path, links: Array.from({ length: fanout }, (_, i) => ({ rel: "child", href: `./${i}/catalog.json` })) });
    };
    return { deps: { ...deps, fetchText }, fetched };
  }

  it("inspects at most its budget of collections, and says it stopped", async () => {
    const { deps: wide } = tree(20, 2);
    const found = await inspectUrl("https://data.example/root/catalog.json", wide);
    expect(found.candidates).toHaveLength(WALK.collections);
    expect(found.partial).toBe(true);
  });

  it("reads at most its budget of documents for the whole tree, however deep", async () => {
    const { deps: deep, fetched } = tree(20, 3);
    const found = await inspectUrl("https://data.example/root/catalog.json", deep);
    expect(found.partial).toBe(true);
    expect(new Set(fetched.filter((u) => !u.endsWith("item.json"))).size).toBeLessThanOrEqual(WALK.documents);
    expect(new Set(fetched).size).toBeLessThanOrEqual(WALK.documents + WALK.collections * 3);
  });

  it("is not partial when it read everything", async () => {
    const found = await inspectUrl(`${ROOT}/catalog.json`, deps);
    expect(found.partial).toBe(false);
  });
});

describe("cogAssetKeys", () => {
  it("keeps GeoTIFFs, drops thumbnails, and puts the visual one first", () => {
    expect(
      cogAssetKeys({
        b04: { href: "b04.tif", roles: ["data"] },
        thumb: { href: "t.tif", roles: ["thumbnail"] },
        visual: { href: "tci.tif", type: "image/tiff", roles: ["visual"] },
        json: { href: "m.json" },
      }),
    ).toStrictEqual(["visual", "b04"]);
  });
});

describe("Time precision", () => {
  it("is told from the Times themselves", () => {
    expect(precisionOf([Date.UTC(2026, 0, 1), Date.UTC(2025, 0, 1)])).toBe("year");
    expect(precisionOf([Date.UTC(2026, 3, 2), Date.UTC(2026, 3, 3)])).toBe("day");
    expect(precisionOf([Date.UTC(2026, 3, 2, 10)])).toBe("minute");
  });

  it("reads fractional seconds and a +00:00 offset, as STAC items write them", () => {
    expect(stacTimeSpec(["2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00+00:00"])).toMatchObject({ precision: "day", series: { stepMinutes: 24 * 60 } });
  });
});

describe("licenceTierFor", () => {
  it("judges only the clear cases", () => {
    expect(licenceTierFor("CC-BY-4.0")).toBe("open");
    expect(licenceTierFor("CC0-1.0")).toBe("open");
    expect(licenceTierFor("CC-BY-NC-SA-4.0")).toBe("restricted");
    expect(licenceTierFor("other")).toBe("unknown");
    expect(licenceTierFor(undefined)).toBe("unknown");
  });
});
