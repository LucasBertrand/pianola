import {
  useCallback,
  useRef,
  type ChangeEvent,
  type RefObject,
} from "react";
import {
  MIDI_CONSTANTS,
} from "../../infrastructure/project-files/midi/midi-constants";
import {
  createMidiExport,
  createMidiFileName,
} from "../../infrastructure/project-files/midi/midi-exporter";
import {
  createMidiExportPlan,
} from "../../application/project-files/midi-export-plan";
import {
  analyzeMidiImport,
} from "../../infrastructure/project-files/midi/analyze-midi-import";
import {
  createProjectFromMidiImport,
} from "../../infrastructure/project-files/midi/create-project-from-midi-import";
import {
  formatMidiImportError,
} from "../../infrastructure/project-files/midi/midi-import-error";
import type {
  MidiImportAnalysis,
  MidiImportCollisionStrategy,
} from "../../infrastructure/project-files/midi/midi-import-types";
import {
  readStandardMidiFile,
} from "../../infrastructure/project-files/midi/smf-reader";
import {
  writeStandardMidiFile,
} from "../../infrastructure/project-files/midi/smf-writer";
import {
  downloadBrowserFile,
} from "./download-browser-file";
import type {
  ApplicationDialogState,
  ShowApplicationAlert,
} from "../../application/dialogs/application-dialog-port";
import type {
  EditorRuntime,
} from "../../application/editor-session/editor-runtime";
import {
  type EditorSessionState,
} from "../../domain/project/project-document";
import {
  getActiveClip,
} from "../../domain/project/project-document";

export interface MidiFileWorkflowOptions {
  readonly runtime: EditorRuntime;
  readonly pendingAnalysisRef: RefObject<MidiImportAnalysis | null>;
  readonly replaceActiveProject: (
    project: EditorSessionState,
    label: string,
  ) => void;
  readonly showDialog: (dialog: ApplicationDialogState) => void;
  readonly alert: ShowApplicationAlert;
}

export interface MidiFileWorkflow {
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly openImport: () => void;
  readonly importFile: (
    event: ChangeEvent<HTMLInputElement>,
  ) => Promise<void>;
  readonly exportFile: () => void;
}

export function useMidiFileWorkflow({
  runtime,
  pendingAnalysisRef,
  replaceActiveProject,
  showDialog,
  alert,
}: MidiFileWorkflowOptions): MidiFileWorkflow {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const commitImport = useCallback(
    (strategy: MidiImportCollisionStrategy): void => {
      const analysis = pendingAnalysisRef.current;

      if (analysis === null) {
        return;
      }

      try {
        const project = createProjectFromMidiImport(analysis, strategy);

        pendingAnalysisRef.current = null;
        replaceActiveProject(
          project,
          "Import MIDI project",
        );
      } catch (error: unknown) {
        pendingAnalysisRef.current = null;
        alert(
          "MIDI import failed",
          formatMidiImportError(error),
          "danger",
        );
      }
    }, [alert, pendingAnalysisRef, replaceActiveProject],
  );

  const presentAnalysis = useCallback(
    (analysis: MidiImportAnalysis): void => {
      pendingAnalysisRef.current = analysis;
      const initialTempo = analysis.tempoMarkers[0];
      const initialMeter = analysis.meterMarkers[0];
      const details = [
        `Format ${String(analysis.sourceFormat)} - ${String(analysis.sourceTicksPerQuarterNote)} PPQN`,
        `${String(analysis.noteCount)} notes - ${String(analysis.instrumentCandidates.length)} instruments`,
        `${formatTempo(initialTempo?.bpm ?? 120)} BPM - ${String(initialMeter?.timeSignature.numerator ?? 4)}/${String(initialMeter?.timeSignature.denominator ?? 4)}`,
        ...analysis.warnings,
      ];

      if (analysis.collisionCount > 0) {
        details.unshift(
          `${String(analysis.collisionCount)} same-instrument, same-pitch overlaps require resolution.`,
        );
      }

      showDialog({
        title: `Import "${analysis.title}"?`,
        message:
          "Importing this MIDI file will replace the active project and discard unsaved changes. Unsupported MIDI performance data is listed below.",
        details,
        confirmLabel:
          analysis.collisionCount > 0
            ? "Merge and import"
            : "Import project",
        alternateLabel:
          analysis.collisionCount > 0
            ? "Slice and import"
            : null,
        cancelLabel: "Cancel",
        tone: "default",
        onConfirm(): void {
          commitImport("merge");
        },
        onAlternate:
          analysis.collisionCount > 0
            ? (): void => {
                commitImport("slice");
              }
            : null,
      });
    }, [commitImport, pendingAnalysisRef, showDialog],
  );

  const openImport = useCallback((): void => {
    const input = inputRef.current;

    if (input !== null) {
      input.value = "";
      input.click();
    }
  }, []);

  const importFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
      const input = event.currentTarget;
      const file = input.files?.[0];

      if (file === undefined) {
        return;
      }

      try {
        if (file.size > MIDI_CONSTANTS.maximumFileBytes) {
          throw new Error("The selected MIDI file is too large.");
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        const midiFile = readStandardMidiFile(bytes);

        presentAnalysis(analyzeMidiImport(midiFile, file.name));
      } catch (error: unknown) {
        pendingAnalysisRef.current = null;
        alert(
          "MIDI import failed",
          formatMidiImportError(error),
          "danger",
        );
      } finally {
        input.value = "";
      }
    }, [alert, pendingAnalysisRef, presentAnalysis],
  );

  const exportFile = useCallback((): void => {
    try {
      const state = runtime.projectStore.getState();
      const midiExport = createMidiExport(
        createMidiExportPlan(state, getActiveClip(state)),
      );
      const bytes = writeStandardMidiFile(midiExport.file);
      const payload = new Uint8Array(bytes.byteLength);

      payload.set(bytes);
      downloadBrowserFile(
        new Blob([payload.buffer], { type: "audio/midi" }),
        createMidiFileName(state.title),
      );

      if (midiExport.warnings.length > 0) {
        alert(
          "MIDI exported with adjustments",
          midiExport.warnings.join(" "),
        );
      }
    } catch (error: unknown) {
      alert(
        "MIDI export failed",
        formatMidiImportError(error),
        "danger",
      );
    }
  }, [alert, runtime]);

  return {
    inputRef,
    openImport,
    importFile,
    exportFile,
  };
}

function formatTempo(tempoBpm: number): string {
  if (Number.isInteger(tempoBpm)) {
    return String(tempoBpm);
  }

  return tempoBpm.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
