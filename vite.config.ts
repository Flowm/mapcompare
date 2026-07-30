/// <reference types="vitest/config" />
import { execSync } from "node:child_process";

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const buildDate = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
let buildSha = "dev";
try {
  buildSha = execSync("git rev-parse --short HEAD").toString().trim();
} catch {
  // not a git checkout (e.g. tarball build)
}

// The preview harness hands the port chosen in .claude/launch.json to Vite
const port = process.env.PORT ? Number(process.env.PORT) : undefined;

export default defineConfig({
  server: { port, strictPort: port !== undefined },
  preview: { port, strictPort: port !== undefined },
  plugins: [vue(), tailwindcss()],
  resolve: {
    tsconfigPaths: true,
  },
  define: {
    __BUILD_DATE__: JSON.stringify(buildDate),
    __BUILD_SHA__: JSON.stringify(buildSha),
  },
  build: {
    // maplibre-gl minifies to ~930 kB (~240 kB gzipped) and lands in its own dedicated
    // chunk. It is the whole point of the app and cannot be split or lazily loaded to any
    // benefit, so the default 500 kB advisory would fire on every build for a chunk that is
    // exactly the expected size. Raised to sit just above it, so a genuine regression in any
    // other chunk still trips the warning.
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      // Silence @vueuse/core's misplaced /* #__PURE__ */ annotation warning
      onLog(level, log, handler) {
        if (log.code === "INVALID_ANNOTATION" && log.id?.includes("@vueuse/core")) return;
        handler(level, log);
      },
      output: {
        codeSplitting: {
          // Deliberately no `src` catch-all group: it would fold app modules into a
          // single chunk and defeat Rolldown's default dynamic-import splitting.
          groups: [
            { name: "vue", test: /@vue|@vueuse/, priority: 60 },
            { name: "maplibre", test: /maplibre-gl/, priority: 40 },
            { name: "vendor", test: /node_modules/, priority: 10 },
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
