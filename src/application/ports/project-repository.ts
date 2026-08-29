import type {
  ClipId,
  InstrumentId,
} from "../../domain/identifiers";
import type {
  ProjectDocument,
} from "../../domain/project/project-document";
import type {
  GridSettings,
} from "../../editor-core/model/grid-settings";
import type {
  PitchSnapSettings,
} from "../../domain/music-theory/pitch-snap";
import type {
  ProjectMigrationReport,
} from "../project-files/project-migration";

/** Navigation state for one clip, expressed without CSS pixel offsets. */
export interface PersistedClipEditorState {
  readonly pitchSnapSettings: PitchSnapSettings;
  readonly gridSettings: GridSettings;
}

/** Project-scoped editing context. It is persisted but never enters history. */
export interface PersistedEditorWorkspace {
  readonly activeClipId: ClipId;
  readonly selectedInstrumentId: InstrumentId | null;
  readonly clipStatesById: Readonly<
    Record<ClipId, PersistedClipEditorState>
  >;
}

/** Atomic local aggregate. `revision` belongs to storage, not Undo/Redo. */
export interface StoredProject {
  readonly documentId: string;
  readonly revision: number;
  readonly updatedAt: string;
  readonly document: ProjectDocument;
  readonly workspace: PersistedEditorWorkspace;
}

export interface ProjectSummary {
  readonly documentId: string;
  readonly title: string;
  readonly revision: number;
  readonly schemaVersion: number;
  readonly updatedAt: string;
  readonly byteSize: number;
}

export interface StoredRevision {
  readonly documentId: string;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface ProjectLoadResult {
  readonly project: StoredProject;
  readonly migration: ProjectMigrationReport;
}

export type ProjectRecoveryCause =
  | "future-version"
  | "migration-missing"
  | "invalid-data"
  | "metadata-inconsistent"
  | "json-corrupt";

export interface ProjectGenerationDiagnostic {
  readonly revision: number;
  readonly cause: ProjectRecoveryCause;
  readonly message: string;
}

export interface ProjectRecoveryExport {
  readonly archiveFileName: string;
  readonly archive: string;
  readonly diagnosticFileName: string;
  readonly diagnostic: string;
}

export interface ProjectRepository {
  list(): Promise<readonly ProjectSummary[]>;
  load(documentId: string): Promise<ProjectLoadResult | null>;
  save(
    snapshot: StoredProject,
    expectedRevision: number | null,
  ): Promise<StoredRevision>;
  exportRecovery(documentId: string): Promise<ProjectRecoveryExport | null>;
  remove(documentId: string): Promise<void>;
}

export function createDocumentId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return (
    `project-${Date.now()}-`
    + Math.random().toString(36).slice(2)
  );
}
