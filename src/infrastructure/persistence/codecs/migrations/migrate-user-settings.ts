import {
  USER_SETTINGS_SCHEMA_VERSION,
} from "../../../../application/ports/user-settings-repository";
import {
  USER_SETTINGS_FORMAT,
} from "../user-settings-codec-constants";
import {
  runVersionedMigrationPipeline,
} from "../../../versioned-data/versioned-migration-pipeline";

export function migrateUserSettings(source: unknown) {
  return runVersionedMigrationPipeline(source, {
    currentVersion: USER_SETTINGS_SCHEMA_VERSION,
    formatsByVersion: {
      1: USER_SETTINGS_FORMAT,
    },
    steps: [],
    messages: {
      invalidFormat: "Stored user settings use an unknown format.",
      futureVersion: (sourceVersion) =>
        `User settings version ${sourceVersion} is newer than this application.`,
      missingMigration: (sourceVersion) =>
        `No user-settings migration starts at version ${sourceVersion}.`,
    },
  });
}
