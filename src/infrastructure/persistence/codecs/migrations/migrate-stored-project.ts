import type {
  ProjectMigrationReport,
} from "../../../../application/project-files/project-migration";
import {
  readPersistenceInteger,
  readPersistenceRecord,
  readPersistenceString,
} from "../persistence-codec-readers";
import {
  ProjectPersistenceError,
} from "../project-persistence-error";
import {
  STORED_PROJECT_FORMAT,
  STORED_PROJECT_SCHEMA_VERSION,
} from "../stored-project-constants";

export function migrateStoredProject(source: unknown): {
  readonly source: Readonly<Record<string, unknown>>;
  readonly report: ProjectMigrationReport;
} {
  let current = readPersistenceRecord(source, "$");
  const format = readPersistenceString(current["format"], "$.format", 64);
  const sourceVersion = readPersistenceInteger(
    current["schemaVersion"],
    "$.schemaVersion",
    0,
  );

  if (sourceVersion > STORED_PROJECT_SCHEMA_VERSION) {
    throw new ProjectPersistenceError(
      "FUTURE_VERSION",
      `Stored project version ${sourceVersion} is newer than `
        + `version ${STORED_PROJECT_SCHEMA_VERSION}.`,
    );
  }

  if (sourceVersion < STORED_PROJECT_SCHEMA_VERSION) {
    throw new ProjectPersistenceError(
      "MIGRATION_MISSING",
      `No stored-project migration starts at version ${sourceVersion}.`,
    );
  }

  if (format !== STORED_PROJECT_FORMAT) {
    throw new ProjectPersistenceError(
      "INVALID_DATA",
      "Stored project uses an unknown format.",
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
