/**
 * The props that show a toggle UButton as on or off, the same way wherever one appears.
 *
 * `on` sets the colour, the variant and `aria-pressed` together, so a toggle cannot look pressed to
 * the eye and not to a screen reader. Small in-panel toggles pass `soft`; header-weight ones keep the
 * default `solid`.
 */
export function pressed(on: boolean, onVariant: "solid" | "soft" = "solid") {
  return {
    color: on ? ("primary" as const) : ("neutral" as const),
    variant: on ? onVariant : ("outline" as const),
    "aria-pressed": on,
  };
}
