import {
  useCallback,
  useState,
} from "react";
import type {
  ClipId,
} from "../../../domain/identifiers";
import {
  getClipPlaybackOrder,
} from "../../../domain/clips/clip-hierarchy";
import type {
  EditorRuntime,
} from "../../../application/editor-session/editor-runtime";
import type {
  ClipWorkflow,
} from "./useClipWorkflow";

export interface ClipDialogWorkflowOptions {
  readonly runtime: EditorRuntime;
  readonly updateClip: ClipWorkflow["update"];
  readonly removeClip: ClipWorkflow["remove"];
  readonly dismissApplicationDialog: () => void;
}

export interface ClipDialogWorkflow {
  readonly open: boolean;
  readonly clipId: ClipId | null;
  readonly name: string;
  readonly color: string;
  readonly canDelete: boolean;
  readonly openEdit: (clipId: ClipId) => void;
  readonly setName: (name: string) => void;
  readonly setColor: (color: string) => void;
  readonly confirm: () => void;
  readonly remove: () => void;
  readonly cancel: () => void;
}

/** Owns the draft and lifecycle for clip identity editing. */
export function useClipDialogWorkflow({
  runtime,
  updateClip,
  removeClip,
  dismissApplicationDialog,
}: ClipDialogWorkflowOptions): ClipDialogWorkflow {
  const [editedClipId, setEditedClipId] = useState<ClipId | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("");

  const cancel = useCallback((): void => {
    setEditedClipId(null);
    setName("");
    setColor("");
  }, []);

  const openEdit = useCallback((clipId: ClipId): void => {
    const clip = runtime.projectStore.getState().clipsById[clipId];

    if (clip === undefined) {
      return;
    }

    dismissApplicationDialog();
    setEditedClipId(clipId);
    setName(clip.name);
    setColor(clip.color);
  }, [dismissApplicationDialog, runtime]);

  const confirm = useCallback((): void => {
    if (editedClipId === null || name.trim().length === 0) {
      return;
    }

    updateClip(editedClipId, {
      name: name.trim(),
      color,
    });
    cancel();
  }, [cancel, color, editedClipId, name, updateClip]);

  const remove = useCallback((): void => {
    if (editedClipId === null) {
      return;
    }

    removeClip(editedClipId);
    cancel();
  }, [cancel, editedClipId, removeClip]);

  return {
    open: editedClipId !== null,
    clipId: editedClipId,
    name,
    color,
    canDelete: getClipPlaybackOrder(
      runtime.projectStore.getState().clipHierarchy,
    ).length > 1,
    openEdit,
    setName,
    setColor,
    confirm,
    remove,
    cancel,
  };
}
