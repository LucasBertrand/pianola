import { describe, expect, test } from "vitest";
import {
  recoverDefaultUserSettings,
} from "../../../../application/ports/user-settings-repository";
import {
  createDefaultInstrumentConfig,
} from "../../../../domain/instrument-presets";
import {
  addPersonalInstrumentPreset,
  deletePersonalInstrumentPreset,
  renamePersonalInstrumentPreset,
  updatePersonalInstrumentPreset,
  validatePersonalPresetName,
} from "../personal-instrument-preset-settings";

describe("personal instrument preset settings", () => {
  test("creates a trimmed personal preset without mutating the source settings", () => {
    const current = recoverDefaultUserSettings();
    const result = addPersonalInstrumentPreset(
      current,
      "personal-test",
      "  My sound  ",
      createDefaultInstrumentConfig(0),
    );

    expect(result.preset.name).toBe("My sound");
    expect(result.settings.personalInstrumentPresetOrder)
      .toEqual(["personal-test"]);
    expect(current.personalInstrumentPresetOrder).toEqual([]);
  });

  test("updates and renames an existing preset while preserving its identity", () => {
    const created = addPersonalInstrumentPreset(
      recoverDefaultUserSettings(),
      "personal-test",
      "Initial",
      createDefaultInstrumentConfig(0),
    );
    const nextConfig = {
      ...created.preset.config,
      filterKeyTracking: 1,
    };
    const updated = updatePersonalInstrumentPreset(
      created.settings,
      created.preset.id,
      nextConfig,
    );
    const renamed = renamePersonalInstrumentPreset(
      updated.settings,
      updated.preset.id,
      "  Renamed  ",
    );

    expect(updated.preset.config.filterKeyTracking).toBe(1);
    expect(renamed.preset).toMatchObject({
      id: "personal-test",
      name: "Renamed",
    });
  });

  test("rejects empty and duplicate names case-insensitively", () => {
    const created = addPersonalInstrumentPreset(
      recoverDefaultUserSettings(),
      "personal-test",
      "Lead",
      createDefaultInstrumentConfig(0),
    );

    expect(() => validatePersonalPresetName("   ")).toThrow(
      "Preset names must contain",
    );
    expect(() => addPersonalInstrumentPreset(
      created.settings,
      "personal-duplicate",
      "lead",
      createDefaultInstrumentConfig(1),
    )).toThrow('A personal preset named "lead" already exists.');
  });

  test("deletes an existing preset from both indexes", () => {
    const created = addPersonalInstrumentPreset(
      recoverDefaultUserSettings(),
      "personal-test",
      "Lead",
      createDefaultInstrumentConfig(0),
    );
    const settings = deletePersonalInstrumentPreset(
      created.settings,
      created.preset.id,
    );

    expect(settings.personalInstrumentPresetOrder).toEqual([]);
    expect(settings.personalInstrumentPresetsById).toEqual({});
  });

  test("rejects updates for presets removed by another settings writer", () => {
    expect(() => updatePersonalInstrumentPreset(
      recoverDefaultUserSettings(),
      "personal-missing",
      createDefaultInstrumentConfig(0),
    )).toThrow("This personal preset no longer exists.");
  });
});
