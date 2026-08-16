# Context

The domain language of mapcompare. Glossary only: no implementation, no decisions.

## Camera

Where every pane is looking: a centre, a zoom, and the three angles. There is exactly one
camera; panes do not have their own. Anything that "goes somewhere" in this app is ultimately
a write to the camera.

## Pane

One map view in the deck. Panes differ only in the Layer they show, never in where they look,
which is what makes them comparable.

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

A curated Destination, chosen because it exposes a difference between providers, and carrying
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
