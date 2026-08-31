import type {
  ProjectMigrationChange,
  ProjectMigrationReport,
} from "../../application/project-files/project-migration";
import {
  readPersistenceInteger,
  readPersistenceRecord,
  readPersistenceString,
} from "../persistence/codecs/persistence-codec-readers";
import {
  ProjectPersistenceError,
} from "../persistence/codecs/project-persistence-error";

export interface VersionedMigrationResult {
  readonly source: Readonly<Record<string, unknown>>;
  readonly report: ProjectMigrationReport;
}

export interface VersionedMigrationStep {
  readonly fromVersion: number;
  readonly toVersion: number;
  migrate(
    source: Readonly<Record<string, unknown>>,
  ): {
    readonly source: Readonly<Record<string, unknown>>;
    readonly changes: readonly ProjectMigrationChange[];
  };
}

export interface VersionedMigrationPipeline {
  readonly currentVersion: number;
  readonly formatsByVersion: Readonly<Record<number, string>>;
  readonly steps: readonly VersionedMigrationStep[];
  readonly messages: {
    readonly invalidFormat: string;
    futureVersion(sourceVersion: number, currentVersion: number): string;
    missingMigration(sourceVersion: number): string;
  };
}

export function runVersionedMigrationPipeline(
  source: unknown,
  pipeline: VersionedMigrationPipeline,
): VersionedMigrationResult {
  let current = readPersistenceRecord(source, "$");
  const sourceVersion = readPersistenceInteger(
    current["schemaVersion"],
    "$.schemaVersion",
    0,
  );

  if (sourceVersion > pipeline.currentVersion) {
    throw new ProjectPersistenceError(
      "FUTURE_VERSION",
      pipeline.messages.futureVersion(
        sourceVersion,
        pipeline.currentVersion,
      ),
    );
  }

  const stepsByVersion = indexMigrationSteps(pipeline);
  const changes: ProjectMigrationChange[] = [];
  let version = sourceVersion;

  assertVersionFormat(current, version, pipeline);

  while (version < pipeline.currentVersion) {
    const step = stepsByVersion.get(version);

    if (step === undefined) {
      throw new ProjectPersistenceError(
        "MIGRATION_MISSING",
        pipeline.messages.missingMigration(version),
      );
    }

    const migrated = step.migrate(current);
    current = readPersistenceRecord(migrated.source, "$");
    version = step.toVersion;
    assertMigratedVersion(current, version, step.fromVersion);
    assertVersionFormat(current, version, pipeline);
    changes.push(...migrated.changes);
  }

  return {
    source: current,
    report: {
      sourceVersion,
      targetVersion: version,
      changes,
    },
  };
}

function indexMigrationSteps(
  pipeline: VersionedMigrationPipeline,
): ReadonlyMap<number, VersionedMigrationStep> {
  const stepsByVersion = new Map<number, VersionedMigrationStep>();

  for (const step of pipeline.steps) {
    if (step.toVersion !== step.fromVersion + 1) {
      throw new Error(
        `Migration ${step.fromVersion} -> ${step.toVersion} is not sequential.`,
      );
    }

    if (stepsByVersion.has(step.fromVersion)) {
      throw new Error(
        `More than one migration starts at version ${step.fromVersion}.`,
      );
    }

    stepsByVersion.set(step.fromVersion, step);
  }

  return stepsByVersion;
}

function assertVersionFormat(
  source: Readonly<Record<string, unknown>>,
  version: number,
  pipeline: VersionedMigrationPipeline,
): void {
  const expectedFormat = pipeline.formatsByVersion[version];

  if (expectedFormat === undefined) {
    throw new ProjectPersistenceError(
      "MIGRATION_MISSING",
      pipeline.messages.missingMigration(version),
    );
  }

  const format = readPersistenceString(source["format"], "$.format", 64);

  if (format !== expectedFormat) {
    throw new ProjectPersistenceError(
      "INVALID_DATA",
      pipeline.messages.invalidFormat,
    );
  }
}

function assertMigratedVersion(
  source: Readonly<Record<string, unknown>>,
  expectedVersion: number,
  sourceVersion: number,
): void {
  const version = readPersistenceInteger(
    source["schemaVersion"],
    "$.schemaVersion",
    0,
  );

  if (version !== expectedVersion) {
    throw new ProjectPersistenceError(
      "INVALID_DATA",
      `Migration from version ${sourceVersion} did not produce version ${expectedVersion}.`,
    );
  }
}
