/// <reference types="vitest/config" />
import { execSync } from "node:child_process";

import ui from "@nuxt/ui/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const buildDate = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
let buildSha = "dev";
try {
  buildSha = execSync("git rev-parse --short HEAD").toString().trim();
} catch {
  // not a git checkout (e.g. tarball build)
}

// The preview harness hands the port chosen in .claude/launch.json to Vite
const port = process.env.PORT ? Number(process.env.PORT) : undefined;

// The chrome colour: matches the logo tile and the theme-color meta in index.html.
const themeColor = "#0b0f14";

export default defineConfig({
  server: { port, strictPort: port !== undefined },
  preview: { port, strictPort: port !== undefined },
  plugins: [
    vue(),
    ui({
      // Composables are imported. The declarations auto-import writes exist only where Vite
      // has run, so an unimported composable would pass vue-tsc locally and fail in CI.
      autoImport: false,
      // A single view with the URL as its state: there is no vue-router, so links render as <a>.
      router: false,
      // Dark-only, set by `class="dark"` in index.html. Nuxt UI's colour mode follows the OS and
      // would strip that class on a light-mode system, turning the chrome white over the imagery.
      colorMode: false,
      ui: {
        // `ink` is the app's own near-black scale, defined in style.css. The status colours are
        // the -400 shades dark mode uses, matching the licence tiers they replaced.
        colors: { primary: "sky", neutral: "ink", success: "emerald", warning: "amber", error: "red" },
        // A shortcut badge means nothing without a keyboard, wherever it appears.
        kbd: { base: "pointer-coarse:hidden" },
        // Every drawer opens from the bottom, so its last row must clear the home indicator.
        drawer: { slots: { container: "pb-[max(--spacing(4),env(safe-area-inset-bottom))]" } },
      },
      // Bundle every icon the app names, .ts data included. An icon the scan misses is
      // fetched from api.iconify.design at runtime, which fails offline and tells a
      // third party which page a visitor is on.
      // Theme CSS only for the components the app uses, found by their tags: about 40% less CSS.
      // LayerPicker renders Drawer and Popover through `<component :is>`, which no tag names.
      experimental: { componentDetection: ["Drawer", "Popover"] },
      icon: { clientBundle: { scan: { globInclude: ["**/*.{vue,ts}"] } } },
    }),
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "mapcompare",
        short_name: "mapcompare",
        description: "Compare map layers side by side — basemaps, daily satellite swaths and geostationary imagery — with resolution, time and licence shown for each.",
        theme_color: themeColor,
        background_color: themeColor,
        display: "standalone",
        start_url: "/",
        scope: "/",
        id: "mapcompare",
        orientation: "natural",
      },
      workbox: {
        // Precache the built app shell only. Tiles, styles, sprites and glyphs come from
        // third-party providers whose terms mostly forbid caching them, and offline maps are
        // out of scope, so there is deliberately no runtimeCaching for them either.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
      },
      pwaAssets: {
        htmlPreset: "2023",
        preset: {
          transparent: { sizes: [64, 192, 512], favicons: [[48, "favicon.ico"]] },
          maskable: { sizes: [512], padding: 0.15, resizeOptions: { background: themeColor } },
          apple: { sizes: [180], padding: 0.15, resizeOptions: { background: themeColor } },
        },
        image: "public/logo.svg",
      },
      devOptions: {
        type: "module",
      },
    }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  optimizeDeps: {
    // Keeps maplibre-gl out of the dependency pre-bundle so its worker stays a sibling module.
    // src/maplibreWorker.ts is the actual fix and covers production too; this only keeps the dev
    // graph honest, since the pre-bundler would otherwise inline the worker's imports separately
    // from the main module.
    exclude: ["maplibre-gl"],
  },
  define: {
    __BUILD_DATE__: JSON.stringify(buildDate),
    __BUILD_SHA__: JSON.stringify(buildSha),
  },
  build: {
    // maplibre-gl minifies to ~1046 kB (~285 kB gzipped) and lands in its own dedicated
    // chunk. It is the whole point of the app and cannot be split or lazily loaded to any
    // benefit, so the default 500 kB advisory would fire on every build for a chunk that is
    // exactly the expected size. Raised to sit just above it, so a genuine regression in any
    // other chunk still trips the warning.
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Deliberately no `src` catch-all group: it would fold app modules into a
          // single chunk and defeat Rolldown's default dynamic-import splitting.
          groups: [
            { name: "vue", test: /@vue|@vueuse/, priority: 60 },
            { name: "ui", test: /@nuxt\/ui|reka-ui|@tanstack/, priority: 50 },
            { name: "icons", test: /@iconify/, priority: 40 },
            { name: "maplibre", test: /maplibre-gl/, priority: 30 },
            { name: "vendor", test: /node_modules/, priority: 10 },
          ],
        },
      },
    },
  },
  test: {
    // Tests that need a DOM opt in per file with `// @vitest-environment jsdom`.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
