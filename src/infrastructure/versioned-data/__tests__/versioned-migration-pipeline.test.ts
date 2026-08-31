import {
  describe,
  expect,
  test,
} from "vitest";
import {
  ProjectPersistenceError,
} from "../../persistence/codecs/project-persistence-error";
import {
  runVersionedMigrationPipeline,
  type VersionedMigrationPipeline,
} from "../versioned-migration-pipeline";

const THREE_VERSION_PIPELINE: VersionedMigrationPipeline = {
  currentVersion: 3,
  formatsByVersion: {
    1: "test.document.v1",
    2: "test.document.v2",
    3: "test.document.v3",
  },
  steps: [
    {
      fromVersion: 1,
      toVersion: 2,
      migrate: (source) => ({
        source: {
          ...source,
          format: "test.document.v2",
          schemaVersion: 2,
          secondVersionField: true,
        },
        changes: [{
          kind: "field-added",
          path: "$.secondVersionField",
          description: "Added the version 2 field.",
        }],
      }),
    },
    {
      fromVersion: 2,
      toVersion: 3,
      migrate: (source) => ({
        source: {
          ...source,
          format: "test.document.v3",
          schemaVersion: 3,
          thirdVersionField: true,
        },
        changes: [{
          kind: "field-added",
          path: "$.thirdVersionField",
          description: "Added the version 3 field.",
        }],
      }),
    },
  ],
  messages: {
    invalidFormat: "Unknown test format.",
    futureVersion: (sourceVersion, currentVersion) =>
      `Version ${sourceVersion} is newer than ${currentVersion}.`,
    missingMigration: (sourceVersion) =>
      `No test migration starts at version ${sourceVersion}.`,
  },
};

describe("versioned migration pipeline", () => {
  test("runs every migration in order and aggregates its report", () => {
    const migrated = runVersionedMigrationPipeline({
      format: "test.document.v1",
      schemaVersion: 1,
    }, THREE_VERSION_PIPELINE);

    expect(migrated.source).toMatchObject({
      format: "test.document.v3",
      schemaVersion: 3,
      secondVersionField: true,
      thirdVersionField: true,
    });
    expect(migrated.report).toMatchObject({
      sourceVersion: 1,
      targetVersion: 3,
    });
    expect(migrated.report.changes.map((change) => change.path)).toEqual([
      "$.secondVersionField",
      "$.thirdVersionField",
    ]);
  });

  test("rejects a missing step without partially accepting the document", () => {
    const pipeline = {
      ...THREE_VERSION_PIPELINE,
      steps: THREE_VERSION_PIPELINE.steps.slice(0, 1),
    };

    expectPipelineError({
      format: "test.document.v1",
      schemaVersion: 1,
    }, pipeline, "MIGRATION_MISSING");
  });

  test("rejects future versions before trying to migrate them", () => {
    expectPipelineError({
      format: "test.document.v4",
      schemaVersion: 4,
    }, THREE_VERSION_PIPELINE, "FUTURE_VERSION");
  });

  test("checks the declared format after every step", () => {
    const pipeline: VersionedMigrationPipeline = {
      ...THREE_VERSION_PIPELINE,
      currentVersion: 2,
      steps: [{
        fromVersion: 1,
        toVersion: 2,
        migrate: (source) => ({
          source: { ...source, schemaVersion: 2 },
          changes: [],
        }),
      }],
    };

    expectPipelineError({
      format: "test.document.v1",
      schemaVersion: 1,
    }, pipeline, "INVALID_DATA");
  });
});

function expectPipelineError(
  source: unknown,
  pipeline: VersionedMigrationPipeline,
  code: ProjectPersistenceError["code"],
): void {
  try {
    runVersionedMigrationPipeline(source, pipeline);
    throw new Error("Expected the migration pipeline to reject the source.");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ProjectPersistenceError);
    expect((error as ProjectPersistenceError).code).toBe(code);
  }
}
