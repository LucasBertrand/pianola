import React, {
  type ChangeEvent,
  type RefObject,
} from "react";
import {
  ProjectMenu,
} from "../project-files/ProjectMenu";

export interface EditorProjectControlsProps {
  readonly projectTitle: string;
  readonly midiInputRef: RefObject<HTMLInputElement | null>;
  readonly onCloseProject: () => void | Promise<void>;
  readonly onExportProject: () => void;
  readonly onOpenMidiImport: () => void;
  readonly onExportMidi: () => void;
  readonly onMidiFileChange: (
    event: ChangeEvent<HTMLInputElement>,
  ) => void | Promise<void>;
  readonly onProjectTitleCommit: (input: HTMLInputElement) => void;
}

export function EditorProjectControls({
  projectTitle,
  midiInputRef,
  onCloseProject,
  onExportProject,
  onOpenMidiImport,
  onExportMidi,
  onMidiFileChange,
  onProjectTitleCommit,
}: EditorProjectControlsProps): React.JSX.Element {
  return (
    <ProjectMenu
      projectTitle={projectTitle}
      midiInputRef={midiInputRef}
      onReturnHome={onCloseProject}
      onExportProject={onExportProject}
      onOpenMidiImport={onOpenMidiImport}
      onExportMidi={onExportMidi}
      onMidiFileChange={onMidiFileChange}
      onProjectTitleCommit={onProjectTitleCommit}
    />
  );
}
