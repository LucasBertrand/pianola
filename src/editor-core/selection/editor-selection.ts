import {
  type Note,
} from "../../domain/notes/note";
import {
  type NoteId,
  type InstrumentId,
  type Tick,
} from "../../domain/identifiers";
import {
  type EditorSessionState,
} from "../../domain/project/project-document";
import {
  getActiveClip,
} from "../../domain/project/project-document";

export type NoteSelectionPredicate = (note: Note) => boolean;

export type MovableTimeMapMarkerKind = "tempo" | "scale" | "section";

export interface SelectedTimeMapMarkerGroup {
  readonly startTick: Tick;
  readonly kinds: readonly MovableTimeMapMarkerKind[];
}

export interface EditorSelectionSnapshot {
  readonly notes: readonly Note[];
  readonly markerGroups: readonly SelectedTimeMapMarkerGroup[];
}

export type EditorSelectionListener = () => void;

/**
 * Owns the editor's transient selection. Notes are stored by persistent ID;
 * time-map marker groups contain only movable point markers
 * (tempo/scale/section),
 * never structural meter markers.
 */
export class EditorSelection {
  private readonly notesById = new Map<NoteId, Note>();
  private readonly markerGroupsByTick =
    new Map<Tick, SelectedTimeMapMarkerGroup>();
  private readonly orderedNotes: Note[] = [];
  private readonly orderedMarkerGroups: SelectedTimeMapMarkerGroup[] = [];
  private readonly listeners = new Set<EditorSelectionListener>();
  private cacheDirty = false;
  private markerCacheDirty = false;

  public get size(): number {
    return this.notesById.size + this.markerGroupsByTick.size;
  }

  public get noteCount(): number {
    return this.notesById.size;
  }

  public get markerGroupCount(): number {
    return this.markerGroupsByTick.size;
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

  public get markerGroups(): readonly SelectedTimeMapMarkerGroup[] {
    if (this.markerCacheDirty) {
      this.orderedMarkerGroups.length = 0;

      for (const group of this.markerGroupsByTick.values()) {
        this.orderedMarkerGroups.push(group);
      }

      this.orderedMarkerGroups.sort(
        (left, right) => left.startTick - right.startTick,
      );
      this.markerCacheDirty = false;
    }

    return this.orderedMarkerGroups;
  }

  public subscribe(listener: EditorSelectionListener): () => void {
    this.listeners.add(listener);

    return (): void => {
      this.listeners.delete(listener);
    };
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
    this.notify();
    return true;
  }

  public delete(noteId: NoteId): boolean {
    const deleted = this.notesById.delete(noteId);

    if (deleted) {
      this.cacheDirty = true;
      this.notify();
    }

    return deleted;
  }

  public clear(): void {
    if (this.notesById.size === 0 && this.markerGroupsByTick.size === 0) {
      return;
    }

    this.notesById.clear();
    this.markerGroupsByTick.clear();
    this.cacheDirty = true;
    this.markerCacheDirty = true;
    this.notify();
  }

  public replace(notes: readonly Note[]): void {
    this.notesById.clear();
    this.markerGroupsByTick.clear();

    for (const note of notes) {
      this.notesById.set(note.id, note);
    }

    this.cacheDirty = true;
    this.markerCacheDirty = true;
    this.notify();
  }

  public hasMarkerGroup(startTick: Tick): boolean {
    return this.markerGroupsByTick.has(startTick);
  }

  public findMarkerGroup(
    startTick: Tick,
  ): SelectedTimeMapMarkerGroup | undefined {
    return this.markerGroupsByTick.get(startTick);
  }

  public addMarkerGroup(group: SelectedTimeMapMarkerGroup): boolean {
    const normalized = normalizeMarkerGroup(group);

    if (
      normalized === null
      || areMarkerGroupsEqual(
        this.markerGroupsByTick.get(normalized.startTick),
        normalized,
      )
    ) {
      return false;
    }

    this.markerGroupsByTick.set(normalized.startTick, normalized);
    this.markerCacheDirty = true;
    this.notify();
    return true;
  }

  public deleteMarkerGroup(startTick: Tick): boolean {
    const deleted = this.markerGroupsByTick.delete(startTick);

    if (deleted) {
      this.markerCacheDirty = true;
      this.notify();
    }

    return deleted;
  }

  public replaceMarkerGroups(
    groups: readonly SelectedTimeMapMarkerGroup[],
  ): void {
    this.markerGroupsByTick.clear();

    for (const group of groups) {
      const normalized = normalizeMarkerGroup(group);

      if (normalized !== null) {
        this.markerGroupsByTick.set(normalized.startTick, normalized);
      }
    }

    this.markerCacheDirty = true;
    this.notify();
  }

  public captureSnapshot(): EditorSelectionSnapshot {
    return {
      notes: this.notes.slice(),
      markerGroups: cloneMarkerGroups(this.markerGroups),
    };
  }

  public restoreSnapshot(
    snapshot: EditorSelectionSnapshot,
    predicate?: NoteSelectionPredicate,
  ): void {
    this.notesById.clear();
    this.markerGroupsByTick.clear();

    for (const note of snapshot.notes) {
      if (predicate === undefined || predicate(note)) {
        this.notesById.set(note.id, note);
      }
    }

    for (const group of snapshot.markerGroups) {
      const normalized = normalizeMarkerGroup(group);

      if (normalized !== null) {
        this.markerGroupsByTick.set(normalized.startTick, normalized);
      }
    }

    this.cacheDirty = true;
    this.markerCacheDirty = true;
    this.notify();
  }

  /** Rebuilds the selection from persistent identifiers after a transaction. */
  public replaceFromNoteIds(
    state: EditorSessionState,
    noteIds: readonly NoteId[],
    predicate?: NoteSelectionPredicate,
  ): void {
    this.notesById.clear();
    const tracksByInstrumentId = getActiveClip(state).tracksByInstrumentId;

    for (const noteId of noteIds) {
      for (const instrumentId of state.instrumentOrder) {
        const note = tracksByInstrumentId[instrumentId]?.notesById[noteId];

        if (
          note !== undefined
          && (predicate === undefined || predicate(note))
        ) {
          this.notesById.set(note.id, note);
          break;
        }
      }
    }

    this.cacheDirty = true;
    this.notify();
  }

  /** Restores notes and movable time-map markers from history identifiers. */
  public replaceFromIdentifiers(
    state: EditorSessionState,
    noteIds: readonly NoteId[],
    markerGroups: readonly SelectedTimeMapMarkerGroup[],
    predicate?: NoteSelectionPredicate,
  ): void {
    this.notesById.clear();
    this.markerGroupsByTick.clear();
    const activeClip = getActiveClip(state);
    const tracksByInstrumentId = activeClip.tracksByInstrumentId;

    for (const noteId of noteIds) {
      for (const instrumentId of state.instrumentOrder) {
        const note = tracksByInstrumentId[instrumentId]?.notesById[noteId];

        if (
          note !== undefined
          && (predicate === undefined || predicate(note))
        ) {
          this.notesById.set(note.id, note);
          break;
        }
      }
    }

    for (const group of markerGroups) {
      const reconciled = reconcileMarkerGroup(
        activeClip.timeline.timeMap,
        group,
      );

      if (reconciled !== null) {
        this.markerGroupsByTick.set(reconciled.startTick, reconciled);
      }
    }

    this.cacheDirty = true;
    this.markerCacheDirty = true;
    this.notify();
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
      this.notify();
    }
  }

  /** Replaces stored note snapshots with their latest project revisions. */
  public reconcile(
    state: EditorSessionState,
    predicate?: NoteSelectionPredicate,
  ): void {
    let changed = false;
    const tracksByInstrumentId = getActiveClip(state).tracksByInstrumentId;

    for (const [noteId, previousNote] of this.notesById) {
      const currentNote =
        tracksByInstrumentId[previousNote.instrumentId]
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

    for (const [startTick, group] of this.markerGroupsByTick) {
      const reconciled = reconcileMarkerGroup(
        getActiveClip(state).timeline.timeMap,
        group,
      );

      if (reconciled === null) {
        this.markerGroupsByTick.delete(startTick);
        this.markerCacheDirty = true;
        changed = true;
      } else if (!areMarkerGroupsEqual(group, reconciled)) {
        this.markerGroupsByTick.set(startTick, reconciled);
        this.markerCacheDirty = true;
        changed = true;
      }
    }

    if (changed) {
      this.cacheDirty = true;
      this.notify();
    }
  }

  /** Toggles every selectable note from one instrument as a single intention. */
  public toggleInstrument(
    state: EditorSessionState,
    instrumentId: InstrumentId,
    predicate?: NoteSelectionPredicate,
  ): boolean {
    const track = getActiveClip(state).tracksByInstrumentId[instrumentId];

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
      this.retain((note) => note.instrumentId !== instrumentId);
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

  public copyNotes(): readonly Note[] {
    return this.notes.slice();
  }

  public getSoleInstrumentId(): InstrumentId | null {
    let soleInstrumentId: InstrumentId | null = null;

    for (const note of this.notesById.values()) {
      if (soleInstrumentId === null) {
        soleInstrumentId = note.instrumentId;
      } else if (note.instrumentId !== soleInstrumentId) {
        return null;
      }
    }

    return soleInstrumentId;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export function createSelectedMarkerGroup(
  startTick: Tick,
  hasTempo: boolean,
  hasScale: boolean,
  hasSection = false,
): SelectedTimeMapMarkerGroup | null {
  const kinds: MovableTimeMapMarkerKind[] = [];

  if (hasTempo) {
    kinds.push("tempo");
  }

  if (hasScale) {
    kinds.push("scale");
  }

  if (hasSection) {
    kinds.push("section");
  }

  return normalizeMarkerGroup({ startTick, kinds });
}

function normalizeMarkerGroup(
  group: SelectedTimeMapMarkerGroup,
): SelectedTimeMapMarkerGroup | null {
  if (!Number.isSafeInteger(group.startTick) || group.startTick < 0) {
    return null;
  }

  const kinds: MovableTimeMapMarkerKind[] = [];

  if (group.startTick > 0 && group.kinds.includes("tempo")) {
    kinds.push("tempo");
  }

  if (group.startTick > 0 && group.kinds.includes("scale")) {
    kinds.push("scale");
  }

  if (group.kinds.includes("section")) {
    kinds.push("section");
  }

  return kinds.length === 0
    ? null
    : { startTick: group.startTick, kinds };
}

function reconcileMarkerGroup(
  timeMap: ReturnType<typeof getActiveClip>["timeline"]["timeMap"],
  group: SelectedTimeMapMarkerGroup,
): SelectedTimeMapMarkerGroup | null {
  return createSelectedMarkerGroup(
    group.startTick,
    group.kinds.includes("tempo")
      && timeMap.tempoMarkers.some(
        (marker) => marker.startTick === group.startTick,
      ),
    group.kinds.includes("scale")
      && timeMap.scaleMarkers.some(
        (marker) => marker.startTick === group.startTick,
      ),
    group.kinds.includes("section")
      && timeMap.sectionMarkers.some(
        (marker) => marker.startTick === group.startTick,
      ),
  );
}

function areMarkerGroupsEqual(
  first: SelectedTimeMapMarkerGroup | undefined,
  second: SelectedTimeMapMarkerGroup,
): boolean {
  return first !== undefined
    && first.startTick === second.startTick
    && first.kinds.length === second.kinds.length
    && first.kinds.every((kind, index) => kind === second.kinds[index]);
}

function cloneMarkerGroups(
  groups: readonly SelectedTimeMapMarkerGroup[],
): SelectedTimeMapMarkerGroup[] {
  return groups.map((group) => ({
    startTick: group.startTick,
    kinds: group.kinds.slice(),
  }));
}
