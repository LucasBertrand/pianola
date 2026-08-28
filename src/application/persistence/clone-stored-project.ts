import {
  MAXIMUM_PROJECT_TITLE_LENGTH,
} from "../../domain/project/project-document";
import type {
  StoredProject,
} from "../ports/project-repository";

/** Creates a new local aggregate without carrying storage/history identity. */
export function createStoredProjectClone(
  source: StoredProject,
  documentId: string,
  updatedAt: string,
): StoredProject {
  return {
    documentId,
    revision: 0,
    updatedAt,
    document: {
      ...source.document,
      revision: 0,
      title: createCopyName(source.document.title),
    },
    workspace: source.workspace,
  };
}

function createCopyName(name: string): string {
  const suffix = " Copy";
  return `${name.slice(
    0,
    MAXIMUM_PROJECT_TITLE_LENGTH - suffix.length,
  )}${suffix}`;
}
