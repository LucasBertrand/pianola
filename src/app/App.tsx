import React, {
  useRef,
} from "react";
import {
  createEditorRuntime,
} from "./create-app-runtime";
import {
  createBlankProjectState,
} from "../use-cases/project-files/create-initial-project";
import type {
  EditorRuntime,
} from "../editor/runtime/editor-runtime";
import {
  PianoRollWorkspace,
} from "../ui/piano-roll/PianoRollWorkspace";

/** Creates the application runtime and exposes the top-level product surface. */
export function App(): React.JSX.Element {
  const runtimeRef = useRef<EditorRuntime | null>(null);

  if (runtimeRef.current === null) {
    runtimeRef.current = createEditorRuntime(
      createBlankProjectState(),
    );
  }

  return <PianoRollWorkspace runtime={runtimeRef.current} />;
}
