import {
  type Note,
} from "../../domain/notes/note";
import {
  type InstrumentId,
} from "../../domain/identifiers";
/** Narrow imperative port exposed to controls outside the piano-roll overlay. */
export interface PianoRollControllerPort {
  getSelectedNotes(): readonly Note[];
  replaceSelection(notes: readonly Note[]): void;
  refreshSelection(): void;
  removeInstrumentFromSelection(instrumentId: InstrumentId): void;
  cancel(): void;
  clearSelection(): void;
}
