import ui from "@nuxt/ui/vue-plugin";
import { createApp } from "vue";

import { usePWAUpdate } from "@/composables/usePWAUpdate";

import App from "./App.vue";
// Both must run before any Map is constructed. See each module for why.
import "./maplibreWorker";
import "./maplibreProtocols";

import "./style.css";

createApp(App).use(ui).mount("#app");

// Register the service worker; the update prompt is rendered by PWAUpdateBar.
usePWAUpdate();
