import type {
  Note,
  InstrumentId,
} from "../domain/model";
/** Imperative editor API exposed to controls outside the piano-roll overlay. */
export interface PianoRollEventController {
  getSelectedNotes(): readonly Note[];
  replaceSelection(notes: readonly Note[]): void;
  removeInstrumentFromSelection(instrumentId: InstrumentId): void;
  togglePitchSelection(pitch: number): void;
  cancel(): void;
  clearSelection(): void;
}
