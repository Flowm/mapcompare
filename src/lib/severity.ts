/**
 * How much a caveat should alarm the reader, and how that looks.
 *
 * Two unrelated judgements produce a severity — a licence tier, and how far a pane is being
 * upscaled past its native zoom — and four surfaces render it. Each of those surfaces used to keep
 * its own three-case map from severity to classes: five maps across four files, three of them
 * byte-identical. Adding a sixth licence tier meant remembering all five, with nothing to remind
 * you, and a missed one rendered an unstyled chip rather than failing to build.
 *
 * The classes live here rather than in the components because severity is a domain judgement whose
 * whole purpose is to be seen: a tier that says "non-commercial" and reads as reassuring green is
 * wrong in the same way a mislabelled tier is wrong.
 */

export type Severity = "ok" | "warn" | "bad";

export interface SeverityClasses {
  /** The bare status dot in a list row. */
  dot: string;
  /** Inline text alongside a label. */
  text: string;
  /** A bordered, backdrop-blurred chip sitting over the map. */
  chip: string;
}

export const SEVERITY_CLASSES: Record<Severity, SeverityClasses> = {
  ok: {
    dot: "bg-tier-open",
    text: "text-tier-open",
    chip: "border-tier-open/40 bg-ink-950/75 text-tier-open",
  },
  warn: {
    dot: "bg-tier-terms",
    text: "text-tier-terms",
    chip: "border-tier-terms/40 bg-ink-950/75 text-tier-terms",
  },
  bad: {
    dot: "bg-tier-restricted",
    text: "text-tier-restricted",
    chip: "border-tier-restricted/40 bg-ink-950/75 text-tier-restricted",
  },
};

export function severityClasses(severity: Severity): SeverityClasses {
  return SEVERITY_CLASSES[severity];
}
