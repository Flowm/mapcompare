import { createApp } from "vue";

import App from "./App.vue";
// Must run before any Map is constructed. See the module for why this is not optional.
import "./maplibreWorker";

import "./style.css";

createApp(App).mount("#app");
