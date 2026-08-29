import type {
  ProjectMigrationReport,
} from "../../../../application/project-files/project-migration";
import {
  ProjectPersistenceError,
} from "../../../persistence/codecs/project-persistence-error";
import {
  readPersistenceInteger,
  readPersistenceRecord,
  readPersistenceString,
} from "../../../persistence/codecs/persistence-codec-readers";
import {
  PIANOLA_PROJECT_FORMAT,
  PIANOLA_PROJECT_SCHEMA_VERSION,
} from "../pianola-project-schema";

export function migratePortableProject(source: unknown): {
  readonly source: Readonly<Record<string, unknown>>;
  readonly report: ProjectMigrationReport;
} {
  let current = readPersistenceRecord(source, "$");
  const format = readPersistenceString(current["format"], "$.format", 64);

  if (format !== PIANOLA_PROJECT_FORMAT) {
    throw new ProjectPersistenceError(
      "INVALID_DATA",
      "The selected file is not a Pianola project.",
    );
  }

  const sourceVersion = readPersistenceInteger(
    current["schemaVersion"],
    "$.schemaVersion",
    0,
  );

  if (sourceVersion > PIANOLA_PROJECT_SCHEMA_VERSION) {
    throw new ProjectPersistenceError(
      "FUTURE_VERSION",
      `Project file version ${sourceVersion} is not supported. `
        + `Current version is ${PIANOLA_PROJECT_SCHEMA_VERSION}.`,
    );
  }

  if (sourceVersion < 1) {
    throw new ProjectPersistenceError(
      "MIGRATION_MISSING",
      `No portable migration starts at version ${sourceVersion}.`,
    );
  }

  return {
    source: current,
    report: {
      sourceVersion,
      targetVersion: sourceVersion,
      changes: [],
    },
  };
}
