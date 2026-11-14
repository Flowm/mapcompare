# Context

The domain language of mapcompare. Glossary only: no implementation, no decisions.

## Camera

Where every pane is looking: a centre, a zoom, and the three angles. There is exactly one
camera; panes do not have their own. Anything that "goes somewhere" in this app is ultimately
a write to the camera.

## Pane

One map view in the deck. Panes differ only in the Layer they show, never in where they look,
which is what makes them comparable.

## Layer

One entry in the catalogue: a single picture of the Earth that a Pane can show, such as Esri
World Imagery or VIIRS NOAA-20 true colour. A Pane shows exactly one Layer, so a Layer must
be meaningful on its own; a transparent product that only makes sense drawn over something
else is not a Layer.

_Avoid_: basemap (that is one Category of Layer), source, provider.

## Provider

The organisation that serves a Layer: NASA GIBS, Esri, EOX, EUMETSAT. One Provider serves
many Layers. A Provider is who to credit and whose terms apply, never how the pixels arrive.

_Avoid_: operator, vendor.

## Time

Which of a Layer's pictures a Pane shows: an EOX vintage, a Wayback snapshot, a day of VIIRS, a
ten-minute Meteosat frame. A Layer either has Times or is static. Two Panes showing the same
Layer at different Times is a Comparison in its own right.

Each Pane has its own Time. A Pane that never chose one shows the Layer's latest.

_Avoid_: variant, date, vintage (as the general term; a vintage is one kind of Time).

## Period

The span of the world a single Time depicts: a year for a vintage, a day for a daily composite,
an instant for a geostationary frame. Asking a Layer for a moment means the Time whose Period
contains it, else the latest one before it; a Layer never answers with a picture of the future.

A Time whose Period is a span is a **composite**, and is still filling in until that span is over.
A **frame** is recorded at its instant and is finished as soon as it is published.

## Category

What kind of picture a Layer is. Every Layer has exactly one:

- **basemap**: hides when. Pixels are chosen across time to be cloud-free and seamless, as in
  Esri World Imagery, EOX cloudless or a Wayback snapshot.
- **satellite**: shows when. Every pixel comes from within one Period, clouds and all, however
  many orbits or platforms were stitched together to cover the Earth.
- **map**: a cartographic drawing of the world rather than a picture of it.

Built from satellite data is not the test: EOX cloudless is Sentinel-2 imagery and still a
basemap.

## Orbit

Where the sensor behind a satellite Layer sits: **leo** (low orbit, sweeping swaths, revisiting
daily or so) or **geo** (geostationary, watching one disk continuously). Only satellite Layers
have one.

## Cadence

How often a Layer offers a new picture: static, vintages, daily, or sub-daily. Follows from the
Layer's Times, never stated separately.

## Ended

A Layer whose newest Time has fallen far behind its Cadence because the sensor or the service
stopped. An ended Layer is still a Layer while its archive is served; its latest is its last
Time.

## Comparison

The pairing of layers a user has assembled across the panes. It is the thing the app exists to
produce, and the reason navigation never touches layers: moving somewhere carries the
comparison with you rather than replacing it.

## Destination

Somewhere the camera can be sent: a position, a zoom to arrive at, and a label if one is known.

Choosing a Preset, searching a Place and pasting a Coordinate all produce one. They differ in
where they come from and how much they know, not in what they produce. A Destination knows
nothing about layers.

## Preset

A curated Destination, chosen because it exposes a difference between Layers, and carrying
the reason it was chosen. Presets are editorial: the list is short, hand-written, and each
entry answers a question about imagery — resolution, vintage, cloud, snow.

Distinct from a Place: a Preset is somewhere worth looking, a Place is merely somewhere.

## Place

A named entity (settlement, region, country) found by searching for its name. Carries the
administrative hierarchy that distinguishes same-named entries from each other.

A Place has no zoom of its own; the zoom to arrive at is inferred from what kind of thing it
is and how big it is.

## Coordinate

A position stated directly, in any of the notations people write positions in. A Coordinate
has no name and cannot acquire one: searching answers names, never positions.

## Precision

The granularity implied by how a Coordinate was written: two decimals mean a city, six mean a
building, whole minutes mean a district.

Precision is a property of the notation, not of the position. It is the only scale information
a Coordinate carries, and so it is what a Coordinate's arrival zoom is derived from.
