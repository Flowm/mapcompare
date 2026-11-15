# Nuxt UI for the chrome, and a compact layout for phones

The interface is built on Nuxt UI v4 (in Vue mode, on Reka UI), set up the same way as the other
frontend projects: composables imported explicitly, icons from Lucide bundled at build time so
nothing is fetched from `api.iconify.design`, and the router integration off because there is no
router. Before this, every popover, listbox, dialog and toggle was written by hand. That gave two
listbox implementations with different keyboard support, a hand-written popover placement module,
and explanations that existed only in `title` attributes, which a touch screen never shows.

The app's own near-black `ink` scale is Nuxt UI's `neutral`, and the licence tiers map onto its
`success`, `warning` and `error`. The chrome looks as it did before.

Phones get a compact layout when the screen is narrower than `md` or shorter than 30rem, so a phone
on its side counts too (`useViewport`, mirrored by the `compact:` CSS variant):

- **Grid panes follow the deck's shape.** In a portrait deck, two and three panes are equal rows,
  not columns. The deck's own size decides, not the screen's orientation. Panes stay equal-sized,
  for the same reason `g3` is three tracks rather than two over one.
- **The layer manager is a bottom drawer**, half height first so the map stays visible. A pane's
  picker is a drawer too, because a pane in portrait can be too short to hang a list off.
- **Explanations open on tap.** A `UTooltip` only names a control. Anything that explains
  something (a licence, a substituted time, a refused tile) is a popover.

## Considered options

- **Reka UI alone, or shadcn-vue**: unstyled primitives with the app's own styling. Rejected in
  favour of matching the other projects, so that one setup and one set of conventions apply
  everywhere.
- **Restricting modes on phones** (no three- or four-pane grids): simpler, but a shared link would
  then mean something different on a phone. Rows keep every mode meaningful.
- **A full-screen layer manager on phones**: simpler than a drawer with snap points, but it hides
  the map while you choose, which is the moment you want to see it.
