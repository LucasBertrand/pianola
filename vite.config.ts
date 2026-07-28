import {
  defineConfig,
} from "vite";

const NGROK_HOST = "crept-oasis-promotion.ngrok-free.dev";

export default defineConfig({
  server: {
    allowedHosts: [NGROK_HOST],
  },
  preview: {
    allowedHosts: [NGROK_HOST],
  },
});
