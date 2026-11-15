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
  /** The Nuxt UI colour a badge or button carries for it. */
  color: "success" | "warning" | "error";
  /** The bare status dot in a list row. */
  dot: string;
  /** Inline text alongside a label. */
  text: string;
}

export const SEVERITY_CLASSES: Record<Severity, SeverityClasses> = {
  ok: { color: "success", dot: "bg-success", text: "text-success" },
  warn: { color: "warning", dot: "bg-warning", text: "text-warning" },
  bad: { color: "error", dot: "bg-error", text: "text-error" },
};
