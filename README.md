# mapcompare

Compare satellite and aerial basemaps side by side over the same ground, with the resolution,
vintage and licence of each one shown as you look at it.

Live at **[mapcompare.frcy.org](https://mapcompare.frcy.org)**.

## Why

There is no free, keyless, globally high-resolution, commercially usable satellite basemap.
Every option gives up exactly one of those four:

- **VersaTiles** is openly licensed and keyless, but its high-resolution layer is European
  national orthophotos — elsewhere you get a ~10 m Sentinel-2 fallback.
- **Esri World Imagery** is keyless and sharp nearly everywhere, but those endpoints are
  licensed for use inside ArcGIS products, not for whatever you are building.
- **Sentinel-2 cloudless** is genuinely global, genuinely cloud-free and free — at 10 m, and
  non-commercial only.
- **Mapbox, MapTiler and Stadia** are sharp, global and properly licensed, and bill you per
  tile.

That trade-off is hard to feel from documentation and obvious the moment you see two providers
over the same street. Hence this.

## Features

- **1–4 synced panes**, a **swipe curtain** with a pixel-exact seam, and **blink** for spotting
  subtle differences — hold `B` to peek at the other layer, `Space` or the on-screen control to
  stay on it
- **~30 layers**: VersaTiles, Esri World Imagery, Esri Clarity, Esri Wayback (one dated snapshot
  per year back to 2014), Sentinel-2 cloudless 2018–2025, NASA GIBS daily, plus Mapbox, MapTiler,
  Stadia, ArcGIS and HERE when you supply a key
- **Optional label overlay** from OpenFreeMap, drawn identically over every pane
- **Licence, vintage, overzoom and missing-tile chips** per pane
- **A layer manager** holding the whole catalogue, the licence notes, the API keys and the sources
  table, with a one-line switcher on every pane for the everyday job
- **Shareable URLs** — every comparison is a link — and preset locations chosen to expose
  provider differences
- No account, no backend, no tracking

## The layers

Every `max zoom` below was **measured** by requesting real tiles and walking the zoom up until the
service stopped returning imagery. Documented ceilings are unreliable; see
[Coverage gotchas](#coverage-gotchas).

### Global, keyless, openly licensed

| Layer                | Coverage                                      | Max zoom                    | Licence                    |
| -------------------- | --------------------------------------------- | --------------------------- | -------------------------- |
| VersaTiles Satellite | European orthophotos 8–50 cm; ~10 m elsewhere | 17 in Europe, ~12 elsewhere | open (CC BY / CC0 / DL-DE) |

The only keyless layer here that is safe for commercial use.

### Global, keyless, with a licence caveat

| Layer                        | Coverage                                  | Max zoom | Licence             |
| ---------------------------- | ----------------------------------------- | -------- | ------------------- |
| Esri World Imagery           | 30 cm–1 m worldwide, 15 cm in some cities | 20       | provider terms      |
| Esri World Imagery (Clarity) | Same archive, different vintage selection | 20       | provider terms      |
| Esri Wayback                 | 13 dated snapshots, 2014–2026             | 20       | provider terms      |
| Sentinel-2 cloudless         | 10 m, global, cloud-free, 2018–2025       | 14       | **CC BY-NC-SA 4.0** |

### Global, daily, low resolution, public domain

| Layer                     | Coverage                            | Max zoom |
| ------------------------- | ----------------------------------- | -------- |
| VIIRS NOAA-20 true colour | Yesterday's Earth at 375 m          | 9        |
| MODIS Terra true colour   | Same at 250 m, archive back to 2000 | 9        |

These show clouds, smoke and dust as they actually were, which every other layer here
deliberately hides.

### Global, needs a key

| Layer                    | Key                   | Free tier                       |
| ------------------------ | --------------------- | ------------------------------- |
| Mapbox Satellite         | `VITE_MAPBOX_TOKEN`   | 750k raster tile requests/month |
| MapTiler Satellite       | `VITE_MAPTILER_KEY`   | 100k requests/month, no card    |
| Stadia Alidade Satellite | `VITE_STADIA_API_KEY` | free for non-commercial use     |
| ArcGIS Imagery           | `VITE_ARCGIS_API_KEY` | monthly allowance, no card      |
| HERE Satellite           | `VITE_HERE_API_KEY`   | 30k/month, card required        |

**ArcGIS Imagery is the licensed route to Esri's imagery.** It is the same pixels as the keyless
Esri entries, on terms that actually cover you. One free signup.

### Reference

**OpenFreeMap Liberty** — a conventional OSM vector map, for when you need to know what you are
looking at. Also the source of the label overlay.

### Deliberately excluded

Google Maps tiles (terms forbid non-Google renderers) · Bing Aerial (Bing Maps for Enterprise is
deprecated, no new keys since June 2025) · LINZ New Zealand (needs a key _and_ is NZ-only) ·
Copernicus Data Space (needs a pre-built Sentinel Hub configuration, not an env var) ·
Planet and Maxar (no free tier) · OpenAerialMap (per-image, not a basemap).

## Licence chips

| Chip             | Meaning                                                                    |
| ---------------- | -------------------------------------------------------------------------- |
| `open`           | CC BY, CC0 or public domain. Reuse freely with the credit shown.           |
| `licensed`       | You are using it under your own provider licence.                          |
| `terms`          | Provider terms restrict reuse; intended for use inside their own products. |
| `metered`        | Every tile is billed against your key. Panning costs requests.             |
| `non-commercial` | Non-commercial only, and sometimes share-alike.                            |

Three edges are worth stating outright:

- **Esri's keyless endpoints** are licensed for ArcGIS Online and ArcGIS Enterprise, not for use
  here. Set `VITE_ARCGIS_API_KEY` for the licensed path to the same imagery.
- **Sentinel-2 cloudless is CC BY-NC-SA 4.0** — non-commercial _and_ share-alike. Its credit must
  appear verbatim and must name the composite year, which the app does automatically.
- **Mapbox bills per tile request through MapLibre** rather than bundling into a cheaper "map
  load", because MapLibre is not a Mapbox renderer.

Every layer's credit is on the map at all times, and the full table is in
**Layers → Sources & licences**.

## Coverage gotchas

These are the things that make a pane look broken when it is working correctly:

- **VersaTiles claims z19 and serves z17.** Its own TileJSON advertises 19. It 404s above z17
  across Europe and above ~z12 everywhere else, because the high-resolution layer is a mosaic of
  European orthophotos over a global Sentinel-2 fallback. The missing-tile chip is what tells you.
- **Sentinel-2 cloudless 2017 covers Europe only**, and answers every other tile with a 200 and a
  transparent placeholder — so no error handler can see it. It is left out of the catalogue
  entirely for that reason; the vintages start at 2018.
- **Esri answers well past its real resolution** by upscaling. Over Amsterdam its z22 and z23
  responses are byte-identical. The declared ceiling here is deliberately lower than what the
  server will hand you, so the overzoom badge stays honest.
- **The NASA daily layers stop at z9.** They are for weather, not detail.
- **Esri Wayback answers 301 for most tiles**, redirecting to whichever release last _changed_
  that tile. That is correct and browsers follow it transparently — it only looks broken if you
  probe with `curl` and forget `-L`.

## API keys

Every key is optional. With none set the app still ships over twenty keyless layers. Keyed
providers stay listed in the layer manager, greyed out with the reason, so you can see what they
would cost — the per-pane switchers leave them out, because everything they list is one click from
being on the map.

**Option 1 — in the app.** Open **Layers → API keys** and paste one. It is stored in that browser
only and takes effect immediately, with no rebuild. Your key overrides any the site was built
with, so you can also blank a built-in key to stop spending someone else's quota.

**Option 2 — `.env`.** Copy `.env.example` to `.env.development` and fill in what you have. Each
variable documents where to get the key and what the free tier is.

```sh
cp .env.example .env.development
```

### On key safety

`VITE_*` values are compiled into the public bundle. They are **not secrets**, and neither are
keys pasted into Settings: any browser-side map key is visible to anyone who opens the network
tab. That is unavoidable for client-side maps. The real protection is an **HTTP referrer
restriction** in your provider's dashboard, which you should set. Shared links never carry keys.

## Develop

```sh
mise trust && mise install   # toolchain: node, pnpm, prek
mise setup                   # install the git hooks
pnpm install
pnpm run dev
```

Scripts are invoked as `pnpm run <script>`, not `pnpm <script>`, so a pnpm builtin of the same
name can never shadow a project script.

| Script                               |                                                      |
| ------------------------------------ | ---------------------------------------------------- |
| `pnpm run dev`                       | Vite dev server                                      |
| `pnpm run build` / `preview`         | Production build and preview it                      |
| `pnpm run test`                      | vitest                                               |
| `pnpm run lint` / `lint:fix`         | oxlint + oxfmt + vue-tsc                             |
| `pnpm run probe-tiles`               | Re-check the registry against the live tile services |
| `pnpm run fetch-wayback`             | Regenerate the Esri Wayback date → release mapping   |
| `pnpm run deploy` / `deploy:preview` | Cloudflare Workers                                   |

## Architecture

Frontend only. No backend, no database, no router, no global store.

```
components → composables → src/lib (pure TypeScript) → nothing
```

Everything testable lives in `src/lib/` with no Vue imports and colocated `*.test.ts`. The URL is
the source of truth for the comparison; `localStorage` holds only API keys and small display
preferences, including whether the layer manager is open.

Four pieces carry most of the risk and most of the comments explaining why:

- **`lib/syncGroup.ts`** keeps every pane on one camera. It rests on a property verified in
  maplibre-gl v6's source: `jumpTo` fires its move events synchronously and unconditionally, so a
  plain re-entrancy guard is airtight. The same reasoning fails for `easeTo`/`flyTo`, which is why
  they are never used to propagate a camera. Unit-tested against a fake map, with no WebGL.
- **`components/BasemapPicker.vue`** teleports its popover to `<body>` and positions it from the
  trigger's viewport rect (`lib/anchor.ts`, unit-tested). Left inside the pane it would be clipped
  three ways: by `overflow-hidden`, by the neighbouring pane's chrome, and in swipe mode by the top
  pane's `clip-path`.
- **`components/MapDeck.vue`** owns the only `v-for` over panes. Mode changes swap CSS, so the map
  instances survive grid ⇄ swipe ⇄ blink instead of being torn down and rebuilt.
- **`src/maplibreWorker.ts`** sets maplibre's worker URL explicitly. Without it, raster tiles work
  and vector tiles silently never render — no error of any kind.

### Adding a layer

**Probe the endpoint before committing anything.** Both `maxzoom` and `tileSize` fail silently in
the browser: a ceiling set too high blanks the pane, and a wrong tile size renders plausible
imagery a whole zoom level off, which in a comparison tool produces confidently wrong conclusions.

1. Add the entry to `src/lib/providers/registry.ts`.
2. Run `pnpm run probe-tiles`. It checks two points, one deliberately non-European, and fails on a
   wrong tile size, an unreachable ceiling, or a no-data placeholder served as a 200.
3. Run `pnpm run test`. The registry guard tests pin the invariants.

## Deploy

Static assets on Cloudflare Workers via `wrangler.jsonc`. CI lints, tests, deploys a preview per
pull request and deploys `main` on merge. Build-time `VITE_*` keys come from repository secrets.

## Attribution

Every visible layer is credited on the map at all times, and **Layers → Sources & licences** lists
each layer's exact credit, licence, measured max zoom and coverage. Map rendering by
[MapLibre GL JS](https://maplibre.org/).

Three details are load-bearing rather than decorative:

- **Mapbox and MapTiler both require their wordmark**, not just a text credit — Mapbox on every map
  drawn from their data, MapTiler on a free-tier key. Because MapLibre is neither vendor's own
  renderer, neither adds it for us, so the app draws it: each vendor's own SVG from `public/logos/`,
  at its own size, unrecoloured and without a background plate, linking where the vendor says. The
  Mapbox credit also carries their mandatory **Improve this map** feedback link.
- **A vendor's own credit is often invisible to us.** MapTiler's `style.json` and OpenFreeMap
  Liberty declare their sources as TileJSON `url`s, so the credit lives in a document MapLibre
  fetches into its own cache. Reading the applied style alone left those panes with no credit at
  all; the registry's `attribution` is the floor, and anything the style declares is added on top.
- **The credit is drawn inside the pane, on the same side as its chips.** In swipe mode the top pane
  is masked with `clip-path`, so a credit on the hidden side would be clipped away — a licensing
  failure, not a cosmetic one. This is also why MapLibre's own `AttributionControl` is off.
