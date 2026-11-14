# One Layer per Pane; overlays are not Layers

A Pane shows exactly one Layer, and only pictures that are meaningful on their own qualify as
Layers. We considered letting a Layer declare a fixed underlay (fires over true colour) and
turning each Pane into a stack of a base plus overlays, and rejected both: a stack changes the URL,
the picker, attribution and what a Comparison is, and the app exists to compare Layers against
each other, not compositions.

## Consequences

- Transparent products (fire hotspots, cloud masks, aerosol depth) stay out of the catalogue even
  where a Provider serves them alongside layers we do include.
- So do Layers that are mostly empty at any given moment: single-orbit swaths (Sentinel-3 OLCI,
  PACE SPEXone, Metop's stacked orbits) and daylight-only RGBs (SEVIRI natural colour, FCI true
  colour). A blank Pane reads as a broken app, and MapLibre does not surface the 404s that would
  let the tile-error badge explain it. Where a Provider offers a day-and-night product for the
  same sensor (Meteosat-12 GeoColour), that is the one we take.
- An underlay can still be added later without breaking links; a stack cannot.
