import { describe, expect, it } from "vitest";

import { collectAttribution, creditParts, dedupeAttribution, sanitizeAttributionHtml } from "./attribution";

describe("creditParts", () => {
  it("credits a provider whose style hides its attribution behind a TileJSON url", () => {
    // The failure this exists for: MapTiler and OpenFreeMap both declare sources as `url`, so a
    // style-only credit rendered those panes with nothing at all.
    const style = { sources: { openmaptiles: { type: "vector", url: "https://tiles.test/planet" } } };
    expect(creditParts(["© MapTiler"], style)).toStrictEqual(["© MapTiler"]);
  });

  it("adds credits the style declares that no descriptor knows about", () => {
    const style = { sources: { extra: { attribution: "© Some vendor" } } };
    expect(creditParts(["© Declared"], style)).toStrictEqual(["© Declared", "© Some vendor"]);
  });

  it("collapses the descriptor and inline copies of the same credit, keeping the descriptor's", () => {
    // Every raster pane: `buildRasterStyle` inlines the descriptor string, so it arrives twice.
    expect(creditParts(["© Vendor"], { sources: { basemap: { attribution: "©  vendor" } } })).toStrictEqual(["© Vendor"]);
  });

  it("still credits when there is no style yet", () => {
    expect(creditParts(["© Vendor"], undefined)).toStrictEqual(["© Vendor"]);
  });
});

describe("collectAttribution", () => {
  it("gathers attribution from every source, in source order", () => {
    const style = {
      sources: {
        basemap: { attribution: "Imagery credit" },
        "ofm-labels": { attribution: "Label credit" },
      },
    };
    expect(collectAttribution(style)).toStrictEqual(["Imagery credit", "Label credit"]);
  });

  it("skips sources with no attribution", () => {
    expect(collectAttribution({ sources: { a: {}, b: { attribution: "  " }, c: { attribution: "Real" } } })).toStrictEqual(["Real"]);
  });

  it("tolerates a style with no sources at all", () => {
    expect(collectAttribution({})).toStrictEqual([]);
    expect(collectAttribution({ sources: {} })).toStrictEqual([]);
  });

  it("trims surrounding whitespace", () => {
    expect(collectAttribution({ sources: { a: { attribution: "  Credit  " } } })).toStrictEqual(["Credit"]);
  });
});

describe("dedupeAttribution", () => {
  it("collapses exact duplicates", () => {
    expect(dedupeAttribution(["© OSM", "© OSM"])).toStrictEqual(["© OSM"]);
  });

  it("collapses duplicates that differ only in whitespace or case", () => {
    // With labels on, most panes credit OpenStreetMap twice — once via the imagery provider and
    // once via the overlay — and the two strings are rarely byte-identical.
    expect(dedupeAttribution(["©  OpenStreetMap   contributors", "© OpenStreetMap contributors"])).toHaveLength(1);
    expect(dedupeAttribution(["© OpenStreetMap Contributors", "© openstreetmap contributors"])).toHaveLength(1);
  });

  it("keeps the first occurrence's original markup", () => {
    const first = '© <a href="https://osm.org">OpenStreetMap</a>';
    const second = '©   <A HREF="https://osm.org">OpenStreetMap</A>';
    expect(dedupeAttribution([first, second])).toStrictEqual([first]);
  });

  it("does not collapse credits that merely share visible text", () => {
    // Deliberately conservative: markup is part of the comparison, so two providers whose text
    // coincides but whose links differ both survive. Over-deduping could drop a required link,
    // whereas under-deduping only shows a slightly redundant credit — the safe direction.
    const linked = '© <a href="https://osm.org">OpenStreetMap</a>';
    expect(dedupeAttribution([linked, "© OpenStreetMap"])).toHaveLength(2);
  });

  it("keeps genuinely different credits", () => {
    expect(dedupeAttribution(["Esri", "© OpenStreetMap"])).toHaveLength(2);
  });

  it("drops empty entries", () => {
    expect(dedupeAttribution(["", "   ", "Real"])).toStrictEqual(["Real"]);
  });
});

describe("sanitizeAttributionHtml", () => {
  it("keeps a plain link with its href and text", () => {
    const out = sanitizeAttributionHtml('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors');
    expect(out).toContain('href="https://www.openstreetmap.org/copyright"');
    expect(out).toContain("OpenStreetMap");
    expect(out).toContain("contributors");
  });

  it("forces links to open safely, without handing over window.opener", () => {
    const out = sanitizeAttributionHtml('<a href="https://example.test">x</a>');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noreferrer noopener"');
  });

  it("keeps light emphasis", () => {
    expect(sanitizeAttributionHtml("<b>Bold</b> <em>em</em> <span>span</span>")).toBe("<b>Bold</b> <em>em</em> <span>span</span>");
  });

  it("strips a script element but keeps surrounding text", () => {
    const out = sanitizeAttributionHtml('Credit <script>alert("x")</script> here');
    expect(out).not.toContain("<script");
    expect(out).toContain("Credit");
    expect(out).toContain("here");
  });

  it("strips event handler attributes", () => {
    const out = sanitizeAttributionHtml('<a href="https://example.test" onclick="steal()" onerror="x">c</a>');
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onerror");
    expect(out).toContain("href=");
  });

  it("strips a javascript: href but keeps the link text", () => {
    // Text is never dropped: losing credit silently is the licensing failure this prevents.
    const out = sanitizeAttributionHtml('<a href="javascript:alert(1)">Provider</a>');
    expect(out).not.toContain("javascript");
    expect(out).toContain("Provider");
  });

  it("strips a javascript: href obfuscated with control characters", () => {
    const out = sanitizeAttributionHtml('<a href="java\tscript:alert(1)">Provider</a>');
    expect(out.toLowerCase()).not.toContain("script:");
    expect(out).toContain("Provider");
  });

  it("strips a data: href", () => {
    const out = sanitizeAttributionHtml('<a href="data:text/html,<b>x</b>">Provider</a>');
    expect(out).not.toContain("data:");
    expect(out).toContain("Provider");
  });

  it("unwraps disallowed elements rather than deleting their text", () => {
    const out = sanitizeAttributionHtml("<div><p>Imagery <b>credit</b></p></div>");
    expect(out).not.toContain("<div");
    expect(out).not.toContain("<p");
    expect(out).toContain("Imagery");
    expect(out).toContain("<b>credit</b>");
  });

  it("removes an img, which could beacon or deface", () => {
    const out = sanitizeAttributionHtml('Credit <img src="https://tracker.test/p.gif" alt="logo">');
    expect(out).not.toContain("<img");
    expect(out).toContain("Credit");
  });

  it("keeps a relative href", () => {
    expect(sanitizeAttributionHtml('<a href="/about">About</a>')).toContain('href="/about"');
  });

  it("drops style attributes, so a credit cannot restyle the app", () => {
    const out = sanitizeAttributionHtml('<span style="position:fixed;inset:0">x</span>');
    expect(out).not.toContain("style");
  });

  it("handles plain text and empty input", () => {
    expect(sanitizeAttributionHtml("Just text")).toBe("Just text");
    expect(sanitizeAttributionHtml("")).toBe("");
  });

  it("passes every real registry attribution through unharmed", () => {
    // A false positive here would silently strip a required legal credit.
    const real = [
      '<a href="https://versatiles.org/sources/">VersaTiles sources</a>',
      'Source: <a href="https://www.esri.com/">Esri</a>, Vantor, Earthstar Geographics, and the GIS User Community',
      'EOxCloudless 2025 <a href="https://cloudless.eox.at">cloudless.eox.at</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)',
      'Imagery: <a href="https://worldview.earthdata.nasa.gov/">NASA EOSDIS GIBS</a> / LANCE',
    ];
    for (const html of real) {
      const out = sanitizeAttributionHtml(html);
      expect(out, html).toContain("<a href=");
      // Every visible word survives.
      for (const word of html
        .replaceAll(/<[^>]*>/g, " ")
        .split(/\s+/)
        .filter(Boolean)) {
        expect(out, `${word} missing from ${out}`).toContain(word);
      }
    }
  });
});
