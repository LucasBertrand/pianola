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

export interface ProjectRepository {
  list(): Promise<readonly ProjectSummary[]>;
  load(documentId: string): Promise<StoredProject | null>;
  save(
    snapshot: StoredProject,
    expectedRevision: number | null,
  ): Promise<StoredRevision>;
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
