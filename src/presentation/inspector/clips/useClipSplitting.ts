import { useCallback, useRef } from "react";
import {
  splitClip,
  type ClipSplitStrategy,
} from "../../../domain/clips/split-clip";
import type {
  ClipGroupId,
  ClipId,
  NoteId,
} from "../../../domain/identifiers";
import type {
  EditorCommandPort,
} from "../../../application/history/editor-command-service";
import type {
  ShowApplicationAlert,
} from "../../../application/dialogs/application-dialog-port";

export interface ClipSplittingOptions {
  readonly commands: EditorCommandPort;
  readonly beginClipChange: () => void;
  readonly duplicateEditorState: (
    sourceClipId: ClipId,
    targetClipId: ClipId,
  ) => void;
  readonly alert: ShowApplicationAlert;
}

/** Builds and atomically installs a group of clips split from one source. */
export function useClipSplitting({
  commands,
  beginClipChange,
  duplicateEditorState,
  alert,
}: ClipSplittingOptions): (
  clipId: ClipId,
  strategy: ClipSplitStrategy,
) => ClipGroupId | null {
  const clipSequenceRef = useRef(0);
  const noteSequenceRef = useRef(0);
  const groupSequenceRef = useRef(0);

  return useCallback((
    clipId: ClipId,
    strategy: ClipSplitStrategy,
  ): ClipGroupId | null => {
    const state = commands.getState();
    const sourceClip = state.clipsById[clipId];

    if (sourceClip === undefined) {
      return null;
    }

    try {
      const clips = splitClip(sourceClip, {
        clock: state.clock,
        strategy,
        createClipId(): ClipId {
          clipSequenceRef.current += 1;
          return createSplitClipId(clipSequenceRef.current);
        },
        createNoteId(): NoteId {
          noteSequenceRef.current += 1;
          return createSplitNoteId(noteSequenceRef.current);
        },
      });

      if (clips.length < 2) {
        alert(
          "Clip not split",
          "Select at least one valid split point.",
          "danger",
        );
        return null;
      }

      groupSequenceRef.current += 1;
      const groupId = createSplitGroupId(groupSequenceRef.current);

      for (const clip of clips) {
        duplicateEditorState(sourceClip.id, clip.id);
      }

      beginClipChange();

      if (commands.dispatch([{
        type: "SplitClipIntoGroup",
        sourceClipId: sourceClip.id,
        groupId,
        clips,
      }], "Split clip into group") === null) {
        return null;
      }

      const firstClip = clips[0];

      if (firstClip !== undefined) {
        commands.selectClip(firstClip.id);
      }

      return groupId;
    } catch (error: unknown) {
      alert(
        "Clip not split",
        error instanceof Error && error.message.length > 0
          ? error.message
          : "The clip could not be split.",
        "danger",
      );
      return null;
    }
  }, [alert, beginClipChange, commands, duplicateEditorState]);
}

function createSplitClipId(sequence: number): ClipId {
  return createGeneratedId("clip-split", sequence);
}

function createSplitNoteId(sequence: number): NoteId {
  return createGeneratedId("note-split", sequence);
}

function createSplitGroupId(sequence: number): ClipGroupId {
  return createGeneratedId("clip-group-split", sequence);
}

function createGeneratedId(prefix: string, sequence: number): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${String(sequence)}`;
}
