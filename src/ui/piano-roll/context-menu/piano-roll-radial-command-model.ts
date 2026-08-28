export type PianoRollRadialCommandId =
  | "copy"
  | "cut"
  | "paste"
  | "slice"
  | "toggle-mute"
  | "add-marker";

export interface PianoRollRadialCommandSnapshot {
  readonly editableNoteSelectionAvailable: boolean;
  readonly editableTimelineSelectionAvailable: boolean;
  readonly selectedNoteCount: number;
  readonly selectionWillBeMuted: boolean;
  readonly clipboardAvailable: boolean;
}

export interface PianoRollRadialCommandModel {
  readonly id: PianoRollRadialCommandId;
  readonly label: string;
  readonly icon: "copy" | "cut" | "paste" | "slice" | "mute" | "unmute" | "marker";
  readonly disabled: boolean;
  readonly tone: "default" | "danger";
}

/** Derives command presentation from an explicit selection snapshot. */
export function createPianoRollRadialCommandModel(
  snapshot: PianoRollRadialCommandSnapshot,
): readonly PianoRollRadialCommandModel[] {
  return [
    {
      id: "copy",
      label: "Copy",
      icon: "copy",
      disabled: !snapshot.editableTimelineSelectionAvailable,
      tone: "default",
    },
    {
      id: "cut",
      label: "Cut",
      icon: "cut",
      disabled: !snapshot.editableTimelineSelectionAvailable,
      tone: "danger",
    },
    {
      id: "paste",
      label: "Paste",
      icon: "paste",
      disabled: !snapshot.clipboardAvailable,
      tone: "default",
    },
    {
      id: "slice",
      label: "Slice",
      icon: "slice",
      disabled: !snapshot.editableNoteSelectionAvailable,
      tone: "default",
    },
    {
      id: "toggle-mute",
      label: snapshot.selectionWillBeMuted ? "Mute" : "Unmute",
      icon: snapshot.selectionWillBeMuted ? "mute" : "unmute",
      disabled: snapshot.selectedNoteCount === 0,
      tone: snapshot.selectionWillBeMuted ? "danger" : "default",
    },
    {
      id: "add-marker",
      label: "Mark",
      icon: "marker",
      disabled: false,
      tone: "default",
    },
  ];
}

export function createPianoRollRadialCenterModel(
  playing: boolean,
): { readonly label: string; readonly icon: "play" | "pause" } {
  return playing
    ? { label: "Pause", icon: "pause" }
    : { label: "Play", icon: "play" };
}
