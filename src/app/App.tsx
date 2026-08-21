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
import {
  BrowserErrorBoundary,
} from "../ui/diagnostics/BrowserErrorBoundary";
import {
  BrowserErrorDialog,
} from "../ui/diagnostics/BrowserErrorDialog";
import {
  browserErrorReporter,
} from "../ui/diagnostics/browser-error-reporter";

/** Creates the application runtime and exposes the top-level product surface. */
export function App(): React.JSX.Element {
  return (
    <>
      <BrowserErrorBoundary reporter={browserErrorReporter}>
        <EditorApplication />
      </BrowserErrorBoundary>
      <BrowserErrorDialog reporter={browserErrorReporter} />
    </>
  );
}

function EditorApplication(): React.JSX.Element {
  const runtimeRef = useRef<EditorRuntime | null>(null);

  if (runtimeRef.current === null) {
    runtimeRef.current = createEditorRuntime(
      createBlankProjectState(),
    );
  }

  return <PianoRollWorkspace runtime={runtimeRef.current} />;
}
