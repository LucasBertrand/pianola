import { describe, expect, test } from "vitest";
import {
  createDefaultInstrumentConfig,
  createDefaultInstrumentPresetLibrary,
} from "../../instrument-presets";
import {
  createPersonalInstrumentPreset,
  mergeInstrumentPresetLibraries,
} from "../../personal-instrument-presets";

describe("personal instrument preset library", () => {
  test("clones a sound when creating a personal preset", () => {
    const config = createDefaultInstrumentConfig(0);
    const preset = createPersonalInstrumentPreset(
      "personal-clone",
      "  Personal Clone  ",
      config,
    );

    expect(preset.name).toBe("Personal Clone");
    expect(preset.config).toEqual(config);
    expect(preset.config).not.toBe(config);
    expect(preset.config.envelope).not.toBe(config.envelope);
  });

  test("uses the current personal definition over a stale project snapshot", () => {
    const builtIns = createDefaultInstrumentPresetLibrary();
    const stale = createPersonalInstrumentPreset(
      "personal-shared",
      "Old Name",
      createDefaultInstrumentConfig(0),
    );
    const current = {
      ...stale,
      name: "Current Name",
      config: {
        ...stale.config,
        filterKeyTracking: 1,
      },
    };
    const merged = mergeInstrumentPresetLibraries(
      { ...builtIns.instrumentPresetsById, [stale.id]: stale },
      [...builtIns.instrumentPresetOrder, stale.id],
      { [current.id]: current },
      [current.id],
    );

    expect(merged.presetsById[current.id]).toEqual(current);
    expect(merged.presetOrder.filter((presetId) => presetId === current.id))
      .toHaveLength(1);
  });
});
