import {
  runVersionedMigrationPipeline,
} from "../../../versioned-data/versioned-migration-pipeline";
import {
  PIANOLA_PROJECT_FORMAT,
  PIANOLA_PROJECT_SCHEMA_VERSION,
} from "../pianola-project-schema";

export function migratePortableProject(source: unknown) {
  return runVersionedMigrationPipeline(source, {
    currentVersion: PIANOLA_PROJECT_SCHEMA_VERSION,
    formatsByVersion: {
      1: PIANOLA_PROJECT_FORMAT,
    },
    steps: [],
    messages: {
      invalidFormat: "The selected file is not a Pianola project.",
      futureVersion: (sourceVersion, currentVersion) =>
        `Project file version ${sourceVersion} is not supported. Current version is ${currentVersion}.`,
      missingMigration: (sourceVersion) =>
        `No portable migration starts at version ${sourceVersion}.`,
    },
  });
}
