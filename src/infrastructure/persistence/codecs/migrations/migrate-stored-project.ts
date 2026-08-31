import {
  STORED_PROJECT_FORMAT,
  STORED_PROJECT_SCHEMA_VERSION,
} from "../stored-project-constants";
import {
  runVersionedMigrationPipeline,
} from "../../../versioned-data/versioned-migration-pipeline";

export function migrateStoredProject(source: unknown) {
  return runVersionedMigrationPipeline(source, {
    currentVersion: STORED_PROJECT_SCHEMA_VERSION,
    formatsByVersion: {
      1: STORED_PROJECT_FORMAT,
    },
    steps: [],
    messages: {
      invalidFormat: "Stored project uses an unknown format.",
      futureVersion: (sourceVersion, currentVersion) =>
        `Stored project version ${sourceVersion} is newer than version ${currentVersion}.`,
      missingMigration: (sourceVersion) =>
        `No stored-project migration starts at version ${sourceVersion}.`,
    },
  });
}
