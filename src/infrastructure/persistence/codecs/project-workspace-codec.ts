import {
  EDITOR_CONSTANTS,
} from "../../../editor-core/model/editor-constants";
import {
  MAXIMUM_ENTITY_ID_LENGTH,
  type ClipId,
} from "../../../domain/identifiers";
import type {
  ProjectDocument,
} from "../../../domain/project/project-document";
import {
  getClipPlaybackOrder,
} from "../../../domain/clips/clip-hierarchy";
import {
  createGridSettings,
  parseGridSubdivision,
} from "../../../editor-core/model/grid-settings";
import type {
  TonalPatternType,
} from "../../../domain/music-theory/pitch-snap";
import {
  isTonalPatternId,
  isSupportedTonalSelection,
} from "../../../domain/music-theory/pitch-snap";
import {
  type PersistedClipEditorState,
  type PersistedEditorWorkspace,
} from "../../../application/ports/project-repository";
import {
  ProjectPersistenceError,
} from "./project-persistence-error";
import {
  readPersistenceBoolean,
  readPersistenceInteger,
  readPersistenceRecord,
  readPersistenceString,
} from "./persistence-codec-readers";

export function parsePersistedEditorWorkspace(
  source: unknown,
  document: ProjectDocument,
  path: string,
): PersistedEditorWorkspace {
  const workspace = readPersistenceRecord(source, path);
  assertExactKeys(
    workspace,
    ["activeClipId", "selectedInstrumentId", "clipStatesById"],
    path,
  );
  const activeClipId = readPersistenceString(
    workspace["activeClipId"],
    `${path}.activeClipId`,
    MAXIMUM_ENTITY_ID_LENGTH,
  );

  if (document.clipsById[activeClipId] === undefined) {
    return invalid(`${path}.activeClipId`, "Active clip does not exist.");
  }

  const selectedSource = workspace["selectedInstrumentId"];
  const selectedInstrumentId = selectedSource === null
    ? null
    : readPersistenceString(
        selectedSource,
        `${path}.selectedInstrumentId`,
        MAXIMUM_ENTITY_ID_LENGTH,
      );

  if (
    selectedInstrumentId !== null
    && document.projectInstrumentsById[selectedInstrumentId] === undefined
  ) {
    return invalid(
      `${path}.selectedInstrumentId`,
      "Selected instrument does not exist.",
    );
  }

  const storedClipStates = readPersistenceRecord(
    workspace["clipStatesById"],
    `${path}.clipStatesById`,
  );
  const storedKeys = Object.keys(storedClipStates).sort();
  const clipOrder = getClipPlaybackOrder(document.clipHierarchy);
  const expectedKeys = [...clipOrder].sort();

  if (
    storedKeys.length !== expectedKeys.length
    || storedKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    return invalid(
      `${path}.clipStatesById`,
      "Workspace clip keys do not match the document.",
    );
  }

  const clipStatesById: Record<ClipId, PersistedClipEditorState> = {};

  for (const clipId of clipOrder) {
    const clip = document.clipsById[clipId];
    const clipPath = `${path}.clipStatesById.${clipId}`;
    const stored = readPersistenceRecord(
      storedClipStates[clipId],
      clipPath,
    );
    assertExactKeys(stored, ["pitchSnapSettings", "gridSettings"], clipPath);

    if (clip === undefined) {
      return invalid(clipPath, "Clip does not exist.");
    }

    clipStatesById[clipId] = {
      pitchSnapSettings: parsePitchSnapSettings(
        stored["pitchSnapSettings"],
        `${clipPath}.pitchSnapSettings`,
      ),
      gridSettings: parseStoredGridSettings(
        stored["gridSettings"],
        `${clipPath}.gridSettings`,
      ),
    };
  }

  return {
    activeClipId,
    selectedInstrumentId,
    clipStatesById,
  };
}

function parsePitchSnapSettings(source: unknown, path: string) {
  const settings = readPersistenceRecord(source, path);
  const patternId = readPersistenceString(
    settings["patternId"],
    `${path}.patternId`,
    64,
  );
  const patternType = readPersistenceString(
    settings["patternType"],
    `${path}.patternType`,
    16,
  );

  if (patternType !== "scale" && patternType !== "chord") {
    return invalid(`${path}.patternType`, "Unsupported tonal pattern type.");
  }

  if (!isTonalPatternId(patternType, patternId)) {
    return invalid(`${path}.patternId`, "Unsupported tonal pattern.");
  }

  const rootNote = readPersistenceString(
    settings["rootNote"],
    `${path}.rootNote`,
    10,
  );

  if (!isSupportedTonalSelection(rootNote, patternType, patternId)) {
    return invalid(path, "Unsupported tonal selection.");
  }

  return {
    enabled: readPersistenceBoolean(
      settings["enabled"],
      `${path}.enabled`,
    ),
    visualGuideEnabled: readPersistenceBoolean(
      settings["visualGuideEnabled"],
      `${path}.visualGuideEnabled`,
    ),
    rootNote,
    patternType: patternType as TonalPatternType,
    patternId,
  };
}

function parseStoredGridSettings(source: unknown, path: string) {
  const settings = readPersistenceRecord(source, path);
  const baseResolutionTicks = readPersistenceInteger(
    settings["baseResolutionTicks"],
    `${path}.baseResolutionTicks`,
    1,
  );
  const subdivisionName = readPersistenceString(
    settings["subdivision"],
    `${path}.subdivision`,
    16,
  );
  const subdivision = parseGridSubdivision(subdivisionName);

  if (
    subdivision === null
    || !EDITOR_CONSTANTS.gridResolutionOptions.some(
      (option) => option.ticks === baseResolutionTicks,
    )
  ) {
    return invalid(path, "Unsupported grid settings.");
  }

  const result = createGridSettings(baseResolutionTicks, subdivision);
  const resolutionTicks = readPersistenceInteger(
    settings["resolutionTicks"],
    `${path}.resolutionTicks`,
    1,
  );

  if (result.resolutionTicks !== resolutionTicks) {
    return invalid(path, "Inconsistent grid resolution.");
  }

  return result;
}

function invalid(path: string, message: string): never {
  throw new ProjectPersistenceError(
    "INVALID_DATA",
    `${message} Location: ${path}.`,
  );
}

function assertExactKeys(
  source: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
  path: string,
): void {
  const actual = Object.keys(source).sort();
  const expected = [...expectedKeys].sort();

  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    invalid(path, "Record contains missing or unknown fields.");
  }
}
