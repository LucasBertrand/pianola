import {
  defineConfig,
} from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: [
        "src/domain/commands/active-clip-command-helpers.ts",
        "src/domain/commands/clip-commands.ts",
        "src/domain/transport/time-map.ts",
        "src/ui/dialogs/InstrumentPresetDialog.tsx",
        "src/ui/inspector/clips/ClipInspector.tsx",
        "src/ui/piano-roll/PianoRollWorkspace.tsx",
      ],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage/hotspots",
    },
    environment: "node",
    include: [
      "src/**/__tests__/*.test.ts",
      "tests/**/*.test.{ts,mjs}",
    ],
  },
});
