import { useCallback } from "react";
import type {
  EditorRuntime,
} from "../../application/editor-session/editor-runtime";
import type {
  ShowApplicationAlert,
  ShowApplicationConfirmation,
  ApplicationDialogState,
} from "../../application/dialogs/application-dialog-port";
import type {
  ClipId,
} from "../../domain/identifiers";
import type {
  AudioPlaybackActions,
} from "../transport/useAudioPlayback";
import {
  useClipWorkflow,
  type ClipWorkflow,
} from "../inspector/clips/useClipWorkflow";
import {
  useClipDialogWorkflow,
  type ClipDialogWorkflow,
} from "../inspector/clips/useClipDialogWorkflow";
import {
  usePlaybackFollowSelection,
} from "../transport/usePianoRollTransportViewport";

export interface ClipsWorkspaceOptions {
  readonly runtime: EditorRuntime;
  readonly clearInteractionSelection: () => void;
  readonly confirm: ShowApplicationConfirmation;
  readonly alert: ShowApplicationAlert;
  readonly showDialog: (dialog: ApplicationDialogState | null) => void;
  readonly autoScrollEnabled: boolean;
  readonly playbackStatus: AudioPlaybackActions["status"];
  readonly activeClipId: ClipId;
  readonly playingClipId: ClipId | null;
}

export interface ClipsWorkspaceResult {
  readonly clips: ClipWorkflow;
  readonly clipDialog: ClipDialogWorkflow;
  readonly selectClipForPlayback: (clipId: ClipId) => void;
  readonly selectClipNotes: (clipId: ClipId) => void;
}

/**
 * Wires clip lifecycle, clip dialog and playback-follow-selection for the
 * workspace. The internal routing (beginClipChange, dismiss dialog, follow
 * policy, selectAllNotes) is encapsulated.
 */
export function useClipsWorkspace({
  runtime,
  clearInteractionSelection,
  confirm,
  alert,
  showDialog,
  autoScrollEnabled,
  playbackStatus,
  activeClipId,
  playingClipId,
}: ClipsWorkspaceOptions): ClipsWorkspaceResult {
  const beginClipChange = useCallback((): void => {
    clearInteractionSelection();
  }, [clearInteractionSelection]);

  const clips = useClipWorkflow({
    commands: runtime.editorCommands,
    beginClipChange,
    duplicateEditorState: runtime.duplicateClipEditorState,
    confirm,
    alert,
  });

  const clipDialog = useClipDialogWorkflow({
    runtime,
    updateClip: clips.update,
    removeClip: clips.remove,
    dismissApplicationDialog(): void {
      showDialog(null);
    },
  });

  const selectClipForPlayback = usePlaybackFollowSelection({
    autoScrollEnabled,
    playbackStatus,
    activeClipId,
    playingClipId,
    selectClip: clips.select,
  });

  const selectClipNotes = useCallback((clipId: ClipId): void => {
    selectClipForPlayback(clipId);
    runtime.selectionRequests.selectAllNotes();
  }, [selectClipForPlayback, runtime]);

  return { clips, clipDialog, selectClipForPlayback, selectClipNotes };
}
