import { getCogMetadata } from "@geomatico/maplibre-cog-protocol";

import { type CogInfo, type Inspection, inspectUrl } from "@/lib/layers/addedInspect";

import { fetchText } from "./discovery";

/**
 * The browser side of adding a Layer by URL: documents through the discovery cache, so the panes
 * that then show the Layer read what inspection already fetched, and COG headers through the same
 * decoder that draws them.
 */

async function cogInfo(url: string): Promise<CogInfo> {
  try {
    const meta = await getCogMetadata(url);
    const zooms = meta.images.filter((i) => !i.isMask).map((i) => i.zoom);
    return { maxzoom: Math.round(Math.max(...zooms)), bbox: meta.bbox };
  } catch (error) {
    // A COG on a host without CORS fails here exactly as it would in a pane, so say why now.
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read the GeoTIFF at ${new URL(url).host}: ${reason}`, { cause: error });
  }
}

export function inspect(url: string): Promise<Inspection> {
  return inspectUrl(url, { fetchText, cogInfo });
}
