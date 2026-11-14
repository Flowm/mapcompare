# Time replaces Variant

Every parameter that turned one Layer into a family (EOX vintages, Wayback releases, GIBS dates)
was a moment in disguise, so the general Variant gives way to Time. Each Time depicts a Period
(a year, a day, an instant), and asking a Layer for a moment means the Time
whose Period contains it, else the latest one before it. This rule is what a future "sync time"
toggle needs: one shared moment can then pick a vintage, a daily composite and a geostationary
frame without ever showing a picture of the future. Picking by start date instead would have
answered 2025-03-01 with the 2025 vintage for the wrong reason and a Wayback release from after
it.

## Consequences

- The URL writes every Time in ISO form (`2024`, `2025-06-12`, `2026-11-13T19:00Z`) rather than a
  Provider's internal id, so a link reads without knowing that Wayback release 4756 is a date.
  Old release-id links still parse. Layer ids and the `p=` format are a public API and do not
  change.
- "Latest" is never written into a link as a concrete Time. A pinned Time that has since aged out
  of a rolling window is clamped to the nearest available one, and the Pane says so.
- Time stays per Pane for now: a shared Time would forbid comparing one Layer against itself a
  year apart, which Wayback and EOX already rely on.
