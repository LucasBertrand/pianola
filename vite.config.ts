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
    // A tunnel can keep browser module responses alive across development
    // server restarts. Disable caching so remote devices always revalidate the
    // current source tree instead of displaying a stale development session.
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Expires: "0",
      Pragma: "no-cache",
    },
  },
});
