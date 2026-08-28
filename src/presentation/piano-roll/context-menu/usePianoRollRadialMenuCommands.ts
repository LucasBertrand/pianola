import {
  createElement,
  useMemo,
} from "react";
import {
  CommandIcon,
} from "../../editor-toolbar/CommandIcon";
import type {
  FloatingRadialMenuItem,
  FloatingRadialMenuProps,
} from "./FloatingRadialMenu";
import {
  createPianoRollRadialCenterModel,
  createPianoRollRadialCommandModel,
  type PianoRollRadialCommandId,
  type PianoRollRadialCommandSnapshot,
} from "./piano-roll-radial-command-model";

export interface PianoRollRadialMenuActions {
  readonly copy: () => void;
  readonly cut: () => void;
  readonly paste: () => void;
  readonly slice: () => void;
  readonly toggleMute: () => void;
  readonly addMarker: () => void;
  readonly togglePlayback: () => void;
}

export interface PianoRollRadialMenuCommands {
  readonly items: readonly FloatingRadialMenuItem[];
  readonly centerButton: NonNullable<FloatingRadialMenuProps["centerButton"]>;
}

/** Binds the pure radial command model to explicitly injected actions. */
export function usePianoRollRadialMenuCommands(
  snapshot: PianoRollRadialCommandSnapshot,
  actions: PianoRollRadialMenuActions,
  playing: boolean,
): PianoRollRadialMenuCommands {
  return useMemo(() => {
    const callbacks: Readonly<
      Record<PianoRollRadialCommandId, () => void>
    > = {
      copy: actions.copy,
      cut: actions.cut,
      paste: actions.paste,
      slice: actions.slice,
      "toggle-mute": actions.toggleMute,
      "add-marker": actions.addMarker,
    };
    const centerModel = createPianoRollRadialCenterModel(playing);

    return {
      items: createPianoRollRadialCommandModel(snapshot).map((item) => ({
        ...item,
        icon: createElement(CommandIcon, { kind: item.icon }),
        onSelect: callbacks[item.id],
      })),
      centerButton: {
        label: centerModel.label,
        icon: createElement(CommandIcon, { kind: centerModel.icon }),
        onSelect: actions.togglePlayback,
      },
    };
  }, [
    actions.addMarker,
    actions.copy,
    actions.cut,
    actions.paste,
    actions.slice,
    actions.toggleMute,
    actions.togglePlayback,
    playing,
    snapshot.clipboardAvailable,
    snapshot.editableNoteSelectionAvailable,
    snapshot.editableTimelineSelectionAvailable,
    snapshot.selectedNoteCount,
    snapshot.selectionWillBeMuted,
  ]);
}
