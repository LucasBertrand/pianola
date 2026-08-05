import {
  defineConfig,
} from "vite";

/**
 * Development-server configuration.
 *
 * Keep the allowlist explicit. Using `true` would expose the development
 * server to DNS-rebinding attacks, while this hostname is the ngrok endpoint
 * intentionally used to test Pianola on external tablets.
 */
export default defineConfig({
  server: {
    allowedHosts: [
      "crept-oasis-promotion.ngrok-free.dev",
    ],
  },
});
