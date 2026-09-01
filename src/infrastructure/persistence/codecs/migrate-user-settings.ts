import {
  USER_SETTINGS_SCHEMA_VERSION,
} from "../../../application/ports/user-settings-repository";
import {
  USER_SETTINGS_FORMAT,
} from "./user-settings-codec-constants";
import {
  runVersionedMigrationPipeline,
} from "../../migration/versioned-migration-pipeline";
import {
  readPersistenceRecord,
} from "./persistence-codec-readers";

export function migrateUserSettings(source: unknown) {
  return runVersionedMigrationPipeline(source, {
    currentVersion: USER_SETTINGS_SCHEMA_VERSION,
    formatsByVersion: {
      1: "app.pianola.user-settings.v1",
      2: USER_SETTINGS_FORMAT,
    },
    steps: [{
      fromVersion: 1,
      toVersion: 2,
      migrate(legacy) {
        return {
          source: {
            ...legacy,
            format: USER_SETTINGS_FORMAT,
            schemaVersion: 2,
            settings: migrateSettingsV1ToV2(legacy["settings"]),
          },
          changes: [{
            kind: "instrument-engine-renamed",
            path: "$.settings.personalInstrumentPresetsById",
            description:
              "Renamed the Subtractive personal preset engine to Synth.",
          }],
        };
      },
    }],
    messages: {
      invalidFormat: "Stored user settings use an unknown format.",
      futureVersion: (sourceVersion) =>
        `User settings version ${sourceVersion} is newer than this application.`,
      missingMigration: (sourceVersion) =>
        `No user-settings migration starts at version ${sourceVersion}.`,
    },
  });
}

function migrateSettingsV1ToV2(
  source: unknown,
): Readonly<Record<string, unknown>> {
  const settings = readPersistenceRecord(source, "$.settings");
  const presets = readPersistenceRecord(
    settings["personalInstrumentPresetsById"],
    "$.settings.personalInstrumentPresetsById",
  );

  return {
    ...settings,
    schemaVersion: settings["schemaVersion"] === 1
      ? 2
      : settings["schemaVersion"],
    personalInstrumentPresetsById: Object.fromEntries(
      Object.entries(presets).map(([presetId, value]) => {
        const presetPath =
          `$.settings.personalInstrumentPresetsById.${presetId}`;
        const preset = readPersistenceRecord(value, presetPath);
        const config = readPersistenceRecord(
          preset["config"],
          `${presetPath}.config`,
        );

        return [presetId, {
          ...preset,
          kind: renameLegacySynthKind(preset["kind"]),
          config: {
            ...config,
            kind: renameLegacySynthKind(config["kind"]),
          },
        }];
      }),
    ),
  };
}

function renameLegacySynthKind(source: unknown): unknown {
  return source === "subtractive" ? "synth" : source;
}
