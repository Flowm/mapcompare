import { cogProtocol } from "@geomatico/maplibre-cog-protocol";
import { addProtocol } from "maplibre-gl";

import { COG_PROTOCOL } from "@/lib/layers/buildStyle";

/**
 * Teaches MapLibre to read Cloud-Optimised GeoTIFFs, for the `cog` and `stac` Layer kinds.
 *
 * The general decoder (geotiff.js) rather than a pass-through of the file's own tiles: it reads
 * any Web Mercator COG, and the satvis mosaic's WebP-compressed tiles decode through the browser's
 * own image decoder. See docs/adr/0003.
 *
 * Imported for its side effect from main.ts, before any Map is constructed.
 */
addProtocol(COG_PROTOCOL, cogProtocol);
