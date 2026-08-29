export interface ProjectMigrationChange {
  readonly kind: string;
  readonly path: string;
  readonly description: string;
}

export interface ProjectMigrationReport {
  readonly sourceVersion: number;
  readonly targetVersion: number;
  readonly changes: readonly ProjectMigrationChange[];
}

export interface ProjectMigrationResult<T> {
  readonly project: T;
  readonly migration: ProjectMigrationReport;
}

export function createUnchangedMigrationReport(
  version: number,
): ProjectMigrationReport {
  return {
    sourceVersion: version,
    targetVersion: version,
    changes: [],
  };
}
