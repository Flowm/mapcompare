# Added Layers: a second source for the catalogue, carried in links

ADR 0003 made the registry the one list of Layers. That still holds for what the app ships, but
the catalogue now has a second source: Added Layers, which the user brings in by URL at runtime
(a STAC collection or item, a COG, an XYZ template). They are ordinary Layers of the existing
kinds, so nothing past the catalogue knows the difference: `useCatalogue` merges them with the
registry, and every surface that lists or looks up Layers reads from it instead of `LAYERS`.

A link to a Comparison carries the full definition of every Added Layer a pane shows, in the `c`
parameter, as base64url JSON. Every comparison stays a link, as it was before, and the recipient
needs no setup. The definition rather than a reference, because there is no server to hold one.

A Layer that arrived in a link is kept in memory for the session and never saved. The first
version saved it, and that caused two bugs. A link is re-read on every Back and Forward, so
stepping back to it re-saved a Layer the user had removed. And opening a link overwrote the
user's own copy of the same source. Saving is now always a deliberate act: adding a Layer, or
choosing Keep on one a link brought.

## Consequences

- A link is untrusted input that ends up in `href`s and fetch targets. Every Added Layer, from a
  link or from storage, is rebuilt field by field: http(s) URLs only, bounded text, an integer
  zoom ceiling, none of the fields only the registry may set (`requiresKey`, `wordmark`), and an
  id derived from its source, so it cannot claim another Layer's id.
- Ids are derived from the source (`added.` plus a hash of kind, URL and asset), so adding the
  same source twice replaces it, and a link and a saved copy agree on which Layer they mean.
- Links that show an Added Layer are long, several hundred characters each. The definition is
  not compressed because decoding has to be synchronous: panes are built from the URL at
  startup.
- Nothing about an Added Layer is measured. Its zoom ceiling comes from the COG's overviews or the
  user's input, and its licence is `unknown` unless the source names a clear SPDX licence.
  `probe-tiles` checks only the registry.
- A link naming a Layer the app cannot rebuild shows that pane's default in its place, rather than
  dropping it and shifting every later pane.
- A Layer can disappear from under a pane: removed here, removed in another tab, or a session
  Layer forgotten. Every pane, hidden ones included, then shows its default rather than naming a
  Layer that is not there.
- Inspection has one budget for the whole walk (documents read, collections inspected, depth) and
  samples a few items per collection, so one click costs about a hundred requests at most however
  large the STAC tree is. A catalogue past the budget is offered in part, and says so.

## Considered options

- **Saving every Layer a link brings.** Simplest, and it caused the two bugs above.
- **A reference instead of a definition** (the STAC URL alone, re-inspected on open). Shorter
  links, but opening one would block on the network, and the user's corrections to name, type and
  zoom would be lost.
