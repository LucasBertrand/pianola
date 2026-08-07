import type {
  Note,
  NoteId,
  ProjectState,
  VoiceId,
} from "../domain/model";

export type NoteSelectionPredicate = (note: Note) => boolean;

/**
 * Owns the editor's transient note selection. The map is the only canonical
 * representation; the ordered array is a lazy read cache for hot rendering
 * and gesture paths.
 */
export class EditorSelection {
  private readonly notesById = new Map<NoteId, Note>();
  private readonly orderedNotes: Note[] = [];
  private cacheDirty = false;

  public get size(): number {
    return this.notesById.size;
  }

  public get notes(): readonly Note[] {
    if (this.cacheDirty) {
      this.orderedNotes.length = 0;

      for (const note of this.notesById.values()) {
        this.orderedNotes.push(note);
      }

      this.cacheDirty = false;
    }

    return this.orderedNotes;
  }

  public has(noteId: NoteId): boolean {
    return this.notesById.has(noteId);
  }

  public find(noteId: NoteId): Note | undefined {
    return this.notesById.get(noteId);
  }

  public add(note: Note): boolean {
    if (this.notesById.has(note.id)) {
      return false;
    }

    this.notesById.set(note.id, note);
    this.cacheDirty = true;
    return true;
  }

  public delete(noteId: NoteId): boolean {
    const deleted = this.notesById.delete(noteId);

    if (deleted) {
      this.cacheDirty = true;
    }

    return deleted;
  }

  public clear(): void {
    if (this.notesById.size === 0) {
      return;
    }

    this.notesById.clear();
    this.cacheDirty = true;
  }

  public replace(notes: readonly Note[]): void {
    this.notesById.clear();

    for (const note of notes) {
      this.notesById.set(note.id, note);
    }

    this.cacheDirty = true;
  }

  public retain(predicate: NoteSelectionPredicate): void {
    let changed = false;

    for (const [noteId, note] of this.notesById) {
      if (!predicate(note)) {
        this.notesById.delete(noteId);
        changed = true;
      }
    }

    if (changed) {
      this.cacheDirty = true;
    }
  }

  /** Replaces stored note snapshots with their latest project revisions. */
  public reconcile(
    state: ProjectState,
    predicate?: NoteSelectionPredicate,
  ): void {
    let changed = false;

    for (const [noteId, previousNote] of this.notesById) {
      const currentNote =
        state
          .tracksByVoiceId[previousNote.voiceId]
          ?.notesById[noteId];

      if (
        currentNote === undefined
        || (predicate !== undefined && !predicate(currentNote))
      ) {
        this.notesById.delete(noteId);
        changed = true;
      } else if (currentNote !== previousNote) {
        this.notesById.set(noteId, currentNote);
        changed = true;
      }
    }

    if (changed) {
      this.cacheDirty = true;
    }
  }

  /** Toggles every selectable note from one voice as a single intention. */
  public toggleVoice(
    state: ProjectState,
    voiceId: VoiceId,
    predicate?: NoteSelectionPredicate,
  ): boolean {
    const track = state.tracksByVoiceId[voiceId];

    if (track === undefined) {
      return false;
    }

    let selectableNoteCount = 0;
    let selectedNoteCount = 0;

    for (const noteId in track.notesById) {
      const note = track.notesById[noteId];

      if (
        note === undefined
        || (predicate !== undefined && !predicate(note))
      ) {
        continue;
      }

      selectableNoteCount += 1;

      if (this.has(note.id)) {
        selectedNoteCount += 1;
      }
    }

    if (selectableNoteCount === 0) {
      return false;
    }

    if (selectedNoteCount === selectableNoteCount) {
      this.retain((note) => note.voiceId !== voiceId);
      return true;
    }

    for (const noteId in track.notesById) {
      const note = track.notesById[noteId];

      if (
        note !== undefined
        && (predicate === undefined || predicate(note))
      ) {
        this.add(note);
      }
    }

    return true;
  }

  /** Toggles a pitch lane across all selectable voices. */
  public togglePitch(
    state: ProjectState,
    pitch: number,
    predicate?: NoteSelectionPredicate,
  ): boolean {
    let selectableNoteCount = 0;
    let selectedNoteCount = 0;

    for (const voiceId of state.voiceOrder) {
      const track = state.tracksByVoiceId[voiceId];

      if (track === undefined) {
        continue;
      }

      for (const noteId in track.notesById) {
        const note = track.notesById[noteId];

        if (
          note === undefined
          || note.pitch !== pitch
          || (predicate !== undefined && !predicate(note))
        ) {
          continue;
        }

        selectableNoteCount += 1;

        if (this.has(note.id)) {
          selectedNoteCount += 1;
        }
      }
    }

    if (selectableNoteCount === 0) {
      return false;
    }

    if (selectedNoteCount === selectableNoteCount) {
      this.retain((note) => note.pitch !== pitch);
      return true;
    }

    for (const voiceId of state.voiceOrder) {
      const track = state.tracksByVoiceId[voiceId];

      if (track === undefined) {
        continue;
      }

      for (const noteId in track.notesById) {
        const note = track.notesById[noteId];

        if (
          note !== undefined
          && note.pitch === pitch
          && (predicate === undefined || predicate(note))
        ) {
          this.add(note);
        }
      }
    }

    return true;
  }

  public copyNotes(): readonly Note[] {
    return this.notes.slice();
  }

  public getSoleVoiceId(): VoiceId | null {
    let soleVoiceId: VoiceId | null = null;

    for (const note of this.notesById.values()) {
      if (soleVoiceId === null) {
        soleVoiceId = note.voiceId;
      } else if (note.voiceId !== soleVoiceId) {
        return null;
      }
    }

    return soleVoiceId;
  }
}
