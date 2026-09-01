import {
  STORED_PROJECT_FORMAT,
  STORED_PROJECT_SCHEMA_VERSION,
} from "./stored-project-constants";
import {
  runVersionedMigrationPipeline,
} from "../../migration/versioned-migration-pipeline";
import {
  migrateProjectDocumentV1ToV2,
} from "../../migration/migrate-project-document-v1-to-v2";

export function migrateStoredProject(source: unknown) {
  return runVersionedMigrationPipeline(source, {
    currentVersion: STORED_PROJECT_SCHEMA_VERSION,
    formatsByVersion: {
      1: "app.pianola.stored-project.v1",
      2: STORED_PROJECT_FORMAT,
    },
    steps: [{
      fromVersion: 1,
      toVersion: 2,
      migrate(legacy) {
        return {
          source: {
            ...legacy,
            format: STORED_PROJECT_FORMAT,
            schemaVersion: 2,
            document: migrateProjectDocumentV1ToV2(
              legacy["document"],
              "$.document",
            ),
          },
          changes: [{
            kind: "instrument-engine-renamed",
            path: "$.document",
            description:
              "Renamed the Subtractive instrument engine and built-in preset IDs to Synth.",
          }],
        };
      },
    }],
    messages: {
      invalidFormat: "Stored project uses an unknown format.",
      futureVersion: (sourceVersion, currentVersion) =>
        `Stored project version ${sourceVersion} is newer than version ${currentVersion}.`,
      missingMigration: (sourceVersion) =>
        `No stored-project migration starts at version ${sourceVersion}.`,
    },
  });
}
