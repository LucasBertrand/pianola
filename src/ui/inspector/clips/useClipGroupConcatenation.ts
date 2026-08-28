import {
  useCallback,
  useRef,
} from "react";
import {
  concatenateClips,
} from "../../../domain/clips/concatenate-clips";
import {
  findClipHierarchyGroup,
  getClipPlaybackOrder,
} from "../../../domain/clips/clip-hierarchy";
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
} from "../../../use-cases/dialogs/application-dialog-port";

export interface ClipGroupConcatenationOptions {
  readonly commands: EditorCommandPort;
  readonly beginClipChange: () => void;
  readonly duplicateEditorState: (
    sourceClipId: ClipId,
    targetClipId: ClipId,
  ) => void;
  readonly alert: ShowApplicationAlert;
}

/** Builds and atomically installs one clip from a group's playback leaves. */
export function useClipGroupConcatenation({
  commands,
  beginClipChange,
  duplicateEditorState,
  alert,
}: ClipGroupConcatenationOptions): (
  groupId: ClipGroupId,
  name: string,
) => ClipId | null {
  const clipSequenceRef = useRef(0);
  const noteSequenceRef = useRef(0);

  return useCallback((groupId: ClipGroupId, name: string): ClipId | null => {
    const state = commands.getState();
    const group = findClipHierarchyGroup(state.clipHierarchy, groupId);
    const normalizedName = name.trim();

    if (group === undefined) {
      return null;
    }

    if (normalizedName.length === 0) {
      alert(
        "Clips not concatenated",
        "Enter a name for the concatenated clip.",
        "danger",
      );
      return null;
    }

    const sourceClipIds = getClipPlaybackOrder(group.children);
    const sourceClips = sourceClipIds.flatMap((clipId) => {
      const clip = state.clipsById[clipId];
      return clip === undefined ? [] : [clip];
    });
    const firstIncludedClip = sourceClips.find(
      (clip) => !clip.bypassEnabled,
    );

    if (
      sourceClipIds.length === 0
      || sourceClips.length !== sourceClipIds.length
      || firstIncludedClip === undefined
    ) {
      alert(
        "Clips not concatenated",
        sourceClipIds.length === 0
          ? "An empty group cannot be concatenated."
          : firstIncludedClip === undefined
            ? "Every clip in this group is bypassed."
          : "One of the group clips no longer exists.",
        "danger",
      );
      return null;
    }

    clipSequenceRef.current += 1;
    const concatenatedClipId = createConcatenatedClipId(
      clipSequenceRef.current,
    );

    try {
      const concatenatedClip = concatenateClips(sourceClips, {
        id: concatenatedClipId,
        name: normalizedName,
        color: group.color,
        clock: state.clock,
        createNoteId(): NoteId {
          noteSequenceRef.current += 1;
          return `${concatenatedClipId}-note-${noteSequenceRef.current}`;
        },
      });

      duplicateEditorState(firstIncludedClip.id, concatenatedClipId);
      beginClipChange();

      if (commands.dispatch([{
        type: "ConcatenateClipGroup",
        groupId,
        clip: concatenatedClip,
      }], "Concatenate clip group") === null) {
        return null;
      }
    } catch (error: unknown) {
      alert(
        "Clips not concatenated",
        formatConcatenationError(error),
        "danger",
      );
      return null;
    }

    commands.selectClip(concatenatedClipId);
    return concatenatedClipId;
  }, [alert, beginClipChange, commands, duplicateEditorState]);
}

function createConcatenatedClipId(sequence: number): ClipId {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `clip-concatenated-${globalThis.crypto.randomUUID()}`;
  }

  return `clip-concatenated-${Date.now()}-${sequence}`;
}

function formatConcatenationError(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : "The clips could not be concatenated.";
}
