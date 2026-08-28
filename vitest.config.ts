import {
  defineConfig,
} from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: [
        "src/domain/commands/active-clip-note-invariants.ts",
        "src/domain/commands/active-clip-track-time-transforms.ts",
        "src/domain/commands/clip-command-invariants.ts",
        "src/domain/commands/clip-concatenation-commands.ts",
        "src/domain/commands/clip-group-commands.ts",
        "src/domain/commands/clip-hierarchy-command-transforms.ts",
        "src/domain/commands/clip-hierarchy-commands.ts",
        "src/domain/commands/clip-transport-time-transforms.ts",
        "src/domain/commands/clip-value-commands.ts",
        "src/domain/commands/measure-command-invariants.ts",
        "src/domain/commands/removed-time-tick.ts",
        "src/domain/transport/meter-marker-operations.ts",
        "src/domain/transport/point-marker-operations.ts",
        "src/domain/transport/time-map-model.ts",
        "src/domain/transport/time-map-navigation.ts",
        "src/domain/transport/time-map-normalization.ts",
        "src/domain/transport/time-map-structural-edits.ts",
        "src/domain/transport/time-signature.ts",
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
