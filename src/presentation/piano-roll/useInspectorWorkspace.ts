import { useState, useCallback } from "react";
import type {
  ProjectInspectorSection,
} from "./PianoRollWorkspaceLayout";

export interface InspectorWorkspaceState {
  readonly open: boolean;
  readonly section: ProjectInspectorSection;
  readonly toggle: (section: ProjectInspectorSection) => void;
}

/** Owns inspector open/close and active section for the workspace. */
export function useInspectorWorkspace(): InspectorWorkspaceState {
  const [open, setOpen] = useState(false);
  const [section, setSection] =
    useState<ProjectInspectorSection>("instruments");

  const toggle = useCallback(
    (targetSection: ProjectInspectorSection): void => {
      if (open && section === targetSection) {
        setOpen(false);
        return;
      }

      setSection(targetSection);
      setOpen(true);
    },
    [open, section],
  );

  return { open, section, toggle };
}
