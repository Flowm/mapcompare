# Generic source kinds, with Times discovered from the service

One registry lists every Layer from every Provider, and how a Layer becomes pixels is decided only
by a protocol-level kind: `xyz`, `style`, `wmts`, `wms`, `cog`, `stac`. There is no GIBS kind and no
per-Provider adapter. We considered both; they turned out unnecessary because GIBS is standard WMTS
and its capabilities already carry everything an adapter would have filled in.

Time-aware Layers discover their Times from the service at runtime (WMTS and WMS capabilities,
STAC items) and fall back to declared rules only where a service publishes nothing. Declared rules
computed from the clock looked simpler and were wrong in practice: PACE OCI lags about four days,
GOES keeps a rolling 90 days with missing slots, and the satvis mosaic keeps five hours, so
"yesterday" or "now minus N" lands on a 404 and a black Pane. One GIBS capabilities document
(about 207 KB gzipped) covers every GIBS Layer, and it is fetched only when a Pane or the picker
needs a time-aware Layer.

## Considered options

- **Per-Provider factories** (`gibs({...})` expanding to full entries): shorter entries, but
  provider code in the registry, and a `wmts` entry is already about as short.
- **A general COG decoder versus a pass-through for Web Mercator-aligned COGs**: we start with
  the general decoder (`maplibre-cog-protocol`) and fall back to the pass-through only if it
  cannot decode WebP-compressed tiles.
