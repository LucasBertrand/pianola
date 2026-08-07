import type {
  Note,
  VoiceId,
} from "../domain/model";
/** Imperative editor API exposed to controls outside the piano-roll overlay. */
export interface PianoRollEventController {
  getSelectedNotes(): readonly Note[];
  replaceSelection(notes: readonly Note[]): void;
  removeVoiceFromSelection(voiceId: VoiceId): void;
  togglePitchSelection(pitch: number): void;
  cancel(): void;
  clearSelection(): void;
}
