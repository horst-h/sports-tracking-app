import { defineConfig } from "vitest/config";

/**
 * Separate from vite.config.ts on purpose: the PWA plugin and the
 * __VITE_BUILD_TIME__ define are irrelevant for tests and only add noise.
 *
 * Timezone: the metrics pipeline builds Dates with local-time semantics
 * (see startOfYear/endOfYear in uiStats.ts and the rolling windows in
 * aggregate.ts). Golden master values are therefore only stable when the
 * timezone is pinned. The npm script sets TZ=Europe/Berlin; setup.ts fails
 * loudly if it is missing, so nobody records golden values against a
 * different zone by accident.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    environment: "node",
  },
});
