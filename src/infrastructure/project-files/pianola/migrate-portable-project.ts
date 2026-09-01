import {
  runVersionedMigrationPipeline,
} from "../../migration/versioned-migration-pipeline";
import {
  PIANOLA_PROJECT_FORMAT,
  PIANOLA_PROJECT_SCHEMA_VERSION,
} from "./pianola-project-schema";
import {
  migrateProjectDocumentV1ToV2,
} from "../../migration/migrate-project-document-v1-to-v2";

export function migratePortableProject(source: unknown) {
  return runVersionedMigrationPipeline(source, {
    currentVersion: PIANOLA_PROJECT_SCHEMA_VERSION,
    formatsByVersion: {
      1: PIANOLA_PROJECT_FORMAT,
      2: PIANOLA_PROJECT_FORMAT,
    },
    steps: [{
      fromVersion: 1,
      toVersion: 2,
      migrate(legacy) {
        return {
          source: {
            ...legacy,
            schemaVersion: 2,
            document: migrateProjectDocumentV1ToV2(
              legacy["document"],
              "$.document",
            ),
          },
          changes: [{
            kind: "instrument-kind-renamed",
            path: "$.document",
            description:
              "Renamed the Subtractive instrument kind and built-in preset IDs to Synth.",
          }],
        };
      },
    }],
    messages: {
      invalidFormat: "The selected file is not a Pianola project.",
      futureVersion: (sourceVersion, currentVersion) =>
        `Project file version ${sourceVersion} is not supported. Current version is ${currentVersion}.`,
      missingMigration: (sourceVersion) =>
        `No portable migration starts at version ${sourceVersion}.`,
    },
  });
}
