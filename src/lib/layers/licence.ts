import { SEVERITY_CLASSES, type Severity, type SeverityClasses } from "@/lib/severity";

import type { Layer, LicenceTier } from "./types";

/**
 * Chip labels and the sentence behind each licence tier.
 *
 * This is the app's second job. Anyone can put two satellite images side by side; the useful part
 * is knowing that the sharper one is the one you are not allowed to use. Kept as data so the same
 * wording appears on the chip tooltip and in the sources dialog.
 */

export interface LicenceTierInfo {
  /** One word for the chip. */
  label: string;
  /** Drives the chip colour. `lib/severity.ts` owns what each level looks like. */
  severity: Severity;
  /** The sentence shown on hover and in the sources list. */
  explanation: string;
}

export const LICENCE_TIERS: Record<LicenceTier, LicenceTierInfo> = {
  open: {
    label: "open",
    severity: "ok",
    explanation: "Open licence (CC BY, CC0 or public domain). Reuse it freely, keeping the credit shown on the map.",
  },
  licensed: {
    label: "licensed",
    // Warn, not ok. Nothing here is free to reuse: what you may do depends on the agreement you
    // hold with the provider, so it belongs with `terms` and `metered` rather than with `open`.
    severity: "warn",
    explanation: "You are using this under your own licence with the provider. Follow their terms.",
  },
  terms: {
    label: "terms",
    severity: "warn",
    explanation:
      "The provider's terms restrict reuse. These endpoints are intended for use inside the provider's own products and are not licensed for commercial use here. Check before reusing anything.",
  },
  metered: {
    label: "metered",
    severity: "warn",
    explanation: "Every tile you load is billed against your own key. Panning and zooming costs requests.",
  },
  restricted: {
    label: "non-commercial",
    severity: "bad",
    explanation: "Non-commercial use only, and for some sources derivatives must be shared alike. A commercial licence is available from the provider.",
  },
  unknown: {
    label: "unknown",
    severity: "warn",
    explanation: "A layer you added by URL whose source states no licence this app can judge. Check the provider's terms before reusing anything.",
  },
};

export function licenceInfo(tier: LicenceTier): LicenceTierInfo {
  return LICENCE_TIERS[tier];
}

/** How a Layer's licence looks: the dot, text and badge colour for its tier's severity. */
export function licenceClasses(layer: Pick<Layer, "licence">): SeverityClasses {
  return SEVERITY_CLASSES[licenceInfo(layer.licence.tier).severity];
}
