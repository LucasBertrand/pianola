import type {
  Note,
  NoteId,
} from "../../domain/model";

export type EditingNoteMaskListener = () => void;

/** Read-only view consumed by renderers. */
export interface ReadonlyEditingNoteMask {
  readonly version: number;
  get(): ReadonlySet<NoteId>;
  subscribe(listener: EditingNoteMaskListener): () => void;
}

/**
 * Owns the temporary set of notes hidden behind interaction previews.
 * Mutations publish an explicit revision instead of relying on a shared Set
 * being polled by a continuous canvas loop.
 */
export class EditingNoteMask implements ReadonlyEditingNoteMask {
  private readonly noteIds = new Set<NoteId>();
  private readonly listeners = new Set<EditingNoteMaskListener>();
  private currentVersion = 0;

  public get version(): number {
    return this.currentVersion;
  }

  public get(): ReadonlySet<NoteId> {
    return this.noteIds;
  }

  public replace(notes: readonly Note[]): void {
    this.noteIds.clear();

    for (const note of notes) {
      this.noteIds.add(note.id);
    }

    this.invalidate();
  }

  public clear(): void {
    if (this.noteIds.size === 0) {
      return;
    }

    this.noteIds.clear();
    this.invalidate();
  }

  public subscribe(listener: EditingNoteMaskListener): () => void {
    this.listeners.add(listener);

    return (): void => {
      this.listeners.delete(listener);
    };
  }

  private invalidate(): void {
    this.currentVersion += 1;

    for (const listener of this.listeners) {
      listener();
    }
  }
}
