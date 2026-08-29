import React, {
  useCallback,
} from "react";
import type {
  ProjectMigrationReport,
} from "../../application/project-files/project-migration";
import {
  ApplicationDialogOverlay,
} from "../dialogs/ApplicationDialogOverlay";
import {
  useApplicationDialogs,
} from "../dialogs/useApplicationDialogs";

export interface ProjectMigrationDialogWorkflow {
  readonly migrationDialog: React.JSX.Element;
  readonly showMigrationReport: (
    report: ProjectMigrationReport,
    title: string,
  ) => void;
}

/** Presents transient migration reports through the shared styled dialog. */
export function useProjectMigrationDialog(): ProjectMigrationDialogWorkflow {
  const dialogs = useApplicationDialogs();
  const showMigrationReport = useCallback((
    report: ProjectMigrationReport,
    title: string,
  ): void => {
    if (report.sourceVersion === report.targetVersion) return;

    const details = report.changes.map((change) => (
      `${change.path}: ${change.description}`
    ));

    dialogs.showDialog({
      title,
      message: `Updated from version ${report.sourceVersion} to `
        + `${report.targetVersion}.`,
      ...(details.length === 0 ? {} : { details }),
      confirmLabel: "OK",
      alternateLabel: null,
      cancelLabel: null,
      tone: "default",
      onConfirm: null,
      onAlternate: null,
    });
  }, [dialogs.showDialog]);

  return {
    showMigrationReport,
    migrationDialog: (
      <ApplicationDialogOverlay
        dialog={dialogs.dialog}
        onConfirm={dialogs.accept}
        onAlternate={dialogs.acceptAlternate}
        onCancel={dialogs.cancel}
      />
    ),
  };
}
