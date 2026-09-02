import { useCallback } from "react";
import type {
  EditorRuntime,
} from "../../application/editor-session/editor-runtime";
import type {
  ShowApplicationAlert,
  ApplicationDialogState,
} from "../../application/dialogs/application-dialog-port";
import type {
  NoteCollisionResolutionRequest,
} from "../../application/piano-roll/notes/note-collision-resolution";
import type {
  MarkerCollisionResolutionRequest,
} from "../../application/piano-roll/timeline/marker-collision-resolution";
import type {
  PianoRollControllerPort,
} from "./piano-roll-controller-port";
import type {
  Note,
} from "../../domain/notes/note";
import { isNoteEditable } from "../../domain/notes/note";
import {
  usePianoRollSelectionWorkflow,
  type PianoRollSelectionWorkflow,
} from "./usePianoRollSelectionWorkflow";
import {
  useFloatingRadialMenu,
  type FloatingRadialMenuController,
} from "../radial-menu/useFloatingRadialMenu";
import {
  usePianoRollRadialMenuCommands,
  type PianoRollRadialMenuCommands,
} from "../radial-menu/usePianoRollRadialMenuCommands";
import {
  useStylusAction,
} from "./interactions/useStylusAction";
import type {
  TimeMapMarkerWorkflow,
} from "./useTimeMapMarkerWorkflow";
import type {
  AudioPlaybackActions,
} from "../transport/useAudioPlayback";

export interface SelectionWorkspaceOptions {
  readonly runtime: EditorRuntime;
  readonly getController: () => PianoRollControllerPort | null;
  readonly resolveCollision: (
    request: NoteCollisionResolutionRequest,
  ) => void;
  readonly resolveMarkerCollision: (
    request: MarkerCollisionResolutionRequest,
  ) => void;
  readonly alert: ShowApplicationAlert;
  readonly showDialog: (dialog: ApplicationDialogState | null) => void;
  readonly selectedNotes: readonly Note[];
  readonly selectedMarkerCount: number;
  readonly playbackStatus: AudioPlaybackActions["status"];
  readonly togglePlayback: () => void;
  readonly openMarkerAtPlayhead: TimeMapMarkerWorkflow["openMarkerAtPlayhead"];
}

export interface SelectionWorkspaceResult {
  readonly selection: PianoRollSelectionWorkflow;
  readonly radialMenu: FloatingRadialMenuController;
  readonly radialMenuCommands: PianoRollRadialMenuCommands;
  readonly editableNoteSelectionAvailable: boolean;
  readonly editableTimelineSelectionAvailable: boolean;
  readonly selectionWillBeMuted: boolean;
  readonly openSliceSelection: () => void;
}

/**
 * Wires selection workflow, radial menu and derived selection flags for the
 * workspace. Stylus action registration is encapsulated.
 */
export function useSelectionWorkspace({
  runtime,
  getController,
  resolveCollision,
  resolveMarkerCollision,
  alert,
  showDialog,
  selectedNotes,
  selectedMarkerCount,
  playbackStatus,
  togglePlayback,
  openMarkerAtPlayhead,
}: SelectionWorkspaceOptions): SelectionWorkspaceResult {
  const selection = usePianoRollSelectionWorkflow({
    commands: runtime.editorCommands,
    selection: runtime.selection,
    getController,
    getPlayheadTick() {
      return runtime.playheadTick.get();
    },
    getGridResolutionTicks() {
      return runtime.gridResolutionTicks.get();
    },
    resolveCollision,
    resolveMarkerCollision,
    alert,
  });

  const radialMenu = useFloatingRadialMenu();

  useStylusAction(radialMenu.toggleAt);

  const editableNoteSelectionAvailable = selectedNotes.some(isNoteEditable);
  const editableTimelineSelectionAvailable =
    editableNoteSelectionAvailable || selectedMarkerCount > 0;
  const selectionWillBeMuted = selectedNotes.some(
    (note) => !note.muted,
  );

  const openSliceSelection = useCallback((): void => {
    showDialog({
      title: "Slice selected notes",
      message: "Choose where to split the selected notes.",
      confirmLabel: "At playhead",
      alternateLabel: "At loop anchors",
      cancelLabel: "Cancel",
      tone: "default",
      onConfirm: selection.sliceAtPlayhead,
      onAlternate: selection.sliceAtLoopAnchors,
    });
  }, [
    selection.sliceAtLoopAnchors,
    selection.sliceAtPlayhead,
    showDialog,
  ]);

  const radialMenuCommands = usePianoRollRadialMenuCommands({
    editableNoteSelectionAvailable,
    editableTimelineSelectionAvailable,
    selectedNoteCount: selectedNotes.length,
    selectionWillBeMuted,
    clipboardAvailable: selection.clipboardAvailable,
  }, {
    copy: selection.copy,
    cut: selection.cut,
    paste: selection.paste,
    slice: openSliceSelection,
    toggleMute: selection.toggleMute,
    addMarker: openMarkerAtPlayhead,
    togglePlayback,
  }, playbackStatus === "playing");

  return {
    selection,
    radialMenu,
    radialMenuCommands,
    editableNoteSelectionAvailable,
    editableTimelineSelectionAvailable,
    selectionWillBeMuted,
    openSliceSelection,
  };
}
