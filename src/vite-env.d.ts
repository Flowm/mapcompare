/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN?: string;
  readonly VITE_MAPTILER_KEY?: string;
  readonly VITE_STADIA_API_KEY?: string;
  readonly VITE_HERE_API_KEY?: string;
  readonly VITE_ARCGIS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __BUILD_DATE__: string;
declare const __BUILD_SHA__: string;
