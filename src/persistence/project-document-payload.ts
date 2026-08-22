import type {
  ProjectDocument,
} from "../domain/project/project-document";

/** Runtime-only revision counters never enter a persistent document. */
export function createProjectDocumentPayload(
  document: ProjectDocument,
): Omit<ProjectDocument, "revision"> {
  return {
    schemaVersion: document.schemaVersion,
    title: document.title,
    clock: document.clock,
    projectInstrumentsById: document.projectInstrumentsById,
    instrumentOrder: document.instrumentOrder,
    instrumentPresetsById: document.instrumentPresetsById,
    instrumentPresetOrder: document.instrumentPresetOrder,
    clipsById: document.clipsById,
    clipOrder: document.clipOrder,
    masterBus: document.masterBus,
  };
}
