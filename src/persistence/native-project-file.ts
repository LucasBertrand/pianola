import type {
  AdsrEnvelope,
  Clip,
  ClipId,
  ClipInstrumentState,
  EffectDescriptor,
  EffectParameterValue,
  GenerativeRuleDescriptor,
  InstrumentConfig,
  InstrumentPreset,
  LoopRegion,
  MasterBusState,
  Note,
  NoteId,
  OscillatorWaveform,
  ProjectState,
  PresetId,
  SubtractiveSynthConfig,
  Track,
  TransportState,
  ProjectInstrument,
  InstrumentId,
  ProjectInstrumentInterpretation,
} from "../domain/model";
import {
  APPLICATION_CONSTANTS,
  EDITOR_CONSTANTS,
  FILE_CONSTANTS,
  PROJECT_CONSTANTS,
  TONAL_SNAP_CONSTANTS,
  VIEWPORT_CONSTANTS,
  INSTRUMENT_CONSTANTS,
} from "../config/program-constants";
import type {
  ViewportState,
} from "../geometry/converter";
import {
  getTonalPatternDefinition,
  isTonalPatternId,
  type PitchSnapSettings,
} from "../music/pitch-snap";
import {
  createGridSettings,
  parseGridSubdivision,
  type GridSettings,
} from "../ui/rendering/grid-settings";
import type {
  NoteColorMode,
} from "../ui/rendering/note-style";
import {
  getTicksPerMeasure,
  MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
  MAXIMUM_MASTER_GAIN,
  MAXIMUM_MASTER_TUNING_FREQUENCY_HZ,
  MAXIMUM_DESCRIPTOR_PARAMETER_COUNT,
  MAXIMUM_ENTITY_ID_LENGTH,
  MAXIMUM_MEASURE_COUNT,
  MAXIMUM_CLIP_NOTE_COUNT,
  MAXIMUM_PROJECT_TITLE_LENGTH,
  MAXIMUM_PROJECT_INSTRUMENT_COUNT,
  MAXIMUM_INSTRUMENT_DESCRIPTOR_COUNT,
  MAXIMUM_INSTRUMENT_NAME_LENGTH,
  MINIMUM_MEASURE_COUNT,
  MINIMUM_MASTER_TUNING_FREQUENCY_HZ,
  MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
  MINIMUM_MASTER_GAIN,
  PROJECT_SCHEMA_VERSION,
} from "../domain/model";
import {
  validateNoteForTrack,
  validateProjectDuration,
  validateTransportState,
  validateProjectInstrument,
  validateInstrumentPreset,
} from "../domain/validation";

export const NATIVE_PROJECT_FILE_FORMAT =
  FILE_CONSTANTS.nativeProjectFormat;
export const NATIVE_PROJECT_FILE_VERSION =
  FILE_CONSTANTS.nativeProjectVersion;
export const NATIVE_PROJECT_FILE_EXTENSION =
  FILE_CONSTANTS.nativeProjectExtension;
export const MAXIMUM_NATIVE_PROJECT_FILE_BYTES =
  FILE_CONSTANTS.nativeProjectMaximumBytes;
export const MAXIMUM_NATIVE_PROJECT_TITLE_LENGTH =
  MAXIMUM_PROJECT_TITLE_LENGTH;

const MAXIMUM_INSTRUMENT_COUNT = MAXIMUM_PROJECT_INSTRUMENT_COUNT;
const MAXIMUM_NOTE_COUNT = MAXIMUM_CLIP_NOTE_COUNT;
const MAXIMUM_NAME_LENGTH = MAXIMUM_INSTRUMENT_NAME_LENGTH;
const MAXIMUM_ID_LENGTH = MAXIMUM_ENTITY_ID_LENGTH;
const MAXIMUM_DESCRIPTOR_COUNT = MAXIMUM_INSTRUMENT_DESCRIPTOR_COUNT;
const MAXIMUM_PARAMETER_COUNT = MAXIMUM_DESCRIPTOR_PARAMETER_COUNT;

type JsonPrimitive = string | number | boolean;
type UnknownRecord = Readonly<Record<string, unknown>>;

export interface NativeProjectFileMetadata {
  readonly documentId: string;
  readonly createdAt: string;
  readonly savedAt: string;
}

export interface NativeProjectSnapshot {
  readonly schemaVersion: number;
  readonly title: string;
  readonly projectInstrumentsById: Readonly<Record<InstrumentId, ProjectInstrument>>;
  readonly instrumentOrder: readonly InstrumentId[];
  readonly instrumentPresetsById: Readonly<Record<PresetId, InstrumentPreset>>;
  readonly instrumentPresetOrder: readonly PresetId[];
  readonly clipsById: Readonly<Record<ClipId, Clip>>;
  readonly clipOrder: readonly ClipId[];
  readonly activeClipId: ClipId;
  readonly masterBus: MasterBusState;
}

export interface NativeProjectFile {
  readonly format: typeof NATIVE_PROJECT_FILE_FORMAT;
  readonly formatVersion: typeof NATIVE_PROJECT_FILE_VERSION;
  readonly metadata: NativeProjectFileMetadata;
  readonly project: NativeProjectSnapshot;
  readonly editor: NativeEditorState;
}

export type NativeViewportState = Pick<
  ViewportState,
  "zoomX" | "zoomY" | "scrollX" | "scrollY"
>;

export type NativeSelectionMode = "replace" | "add" | "subtract";

export interface NativeClipEditorState {
  readonly playheadTick: number;
  readonly pitchSnapSettings: PitchSnapSettings;
  readonly gridSettings: GridSettings;
  readonly viewport: NativeViewportState;
}

/** Durable editor preferences that define the user's project workspace. */
export interface NativeEditorState {
  readonly selectedInstrumentId: InstrumentId | null;
  readonly selectionMode: NativeSelectionMode;
  readonly noteColorMode: NoteColorMode;
  readonly pitchPreviewEnabled: boolean;
  readonly clipStatesById: Readonly<
    Record<ClipId, NativeClipEditorState>
  >;
}

export interface LoadedNativeProject {
  readonly metadata: NativeProjectFileMetadata;
  readonly projectState: ProjectState;
  readonly editorState: NativeEditorState;
}

export type NativeProjectFileErrorCode =
  | "INVALID_JSON"
  | "INVALID_FORMAT"
  | "UNSUPPORTED_VERSION"
  | "INVALID_DATA";

export class NativeProjectFileError extends Error {
  public readonly code: NativeProjectFileErrorCode;
  public readonly path: string;

  public constructor(
    code: NativeProjectFileErrorCode,
    path: string,
    message: string,
  ) {
    super(message);
    this.name = "NativeProjectFileError";
    this.code = code;
    this.path = path;
  }
}

export function serializeNativeProjectFile(
  state: ProjectState,
  metadata: NativeProjectFileMetadata,
  editorState: NativeEditorState,
): string {
  const clipsById: Record<ClipId, Clip> = {};

  for (const clipId of state.clipOrder) {
    const clip = state.clipsById[clipId];

    if (clip !== undefined) {
      clipsById[clipId] = {
        ...clip,
        transportSettings: {
          ...clip.transportSettings,
          anchorAudioTimeSeconds: null,
        },
      };
    }
  }

  const document: NativeProjectFile = {
    format: NATIVE_PROJECT_FILE_FORMAT,
    formatVersion: NATIVE_PROJECT_FILE_VERSION,
    metadata,
    project: {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      title: state.title,
      projectInstrumentsById: state.projectInstrumentsById,
      instrumentOrder: state.instrumentOrder,
      instrumentPresetsById: state.instrumentPresetsById,
      instrumentPresetOrder: state.instrumentPresetOrder,
      clipsById,
      clipOrder: state.clipOrder,
      activeClipId: state.activeClipId,
      masterBus: state.masterBus,
    },
    editor: editorState,
  };
  const serialized = JSON.stringify(document, null, 2);

  parseNativeProjectFile(serialized);
  return serialized;
}

export function parseNativeProjectFile(
  serialized: string,
): LoadedNativeProject {
  let source: unknown;

  try {
    source = JSON.parse(serialized) as unknown;
  } catch {
    fail(
      "INVALID_JSON",
      "$",
      "The selected file does not contain valid JSON.",
    );
  }

  const document = readRecord(source, "$");
  const format = readString(
    document["format"],
    "$.format",
    MAXIMUM_NAME_LENGTH,
  );

  if (format !== NATIVE_PROJECT_FILE_FORMAT) {
    fail(
      "INVALID_FORMAT",
      "$.format",
      "The selected file is not a native Pianola project.",
    );
  }

  const formatVersion = readSafeInteger(
    document["formatVersion"],
    "$.formatVersion",
  );

  if (formatVersion !== NATIVE_PROJECT_FILE_VERSION) {
    fail(
      "UNSUPPORTED_VERSION",
      "$.formatVersion",
      `Native project version ${formatVersion} is not supported.`,
    );
  }

  const metadata = parseMetadata(
    document["metadata"],
    "$.metadata",
  );
  const projectState = parseProjectSnapshot(
    document["project"],
    "$.project",
  );
  const editorState = parseEditorState(
    document["editor"],
    projectState,
    "$.editor",
  );

  return {
    metadata,
    projectState,
    editorState,
  };
}

export function createNativeProjectFileName(
  projectTitle: string,
): string {
  const baseName = projectTitle
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);

  return (
    `${
      baseName.length > 0
        ? baseName
        : `${APPLICATION_CONSTANTS.productSlug}-project`
    }`
    + NATIVE_PROJECT_FILE_EXTENSION
  );
}

function parseMetadata(
  source: unknown,
  path: string,
): NativeProjectFileMetadata {
  const metadata = readRecord(source, path);
  const documentId = readNonEmptyString(
    metadata["documentId"],
    `${path}.documentId`,
    MAXIMUM_ID_LENGTH,
  );
  const createdAt = readIsoDate(
    metadata["createdAt"],
    `${path}.createdAt`,
  );
  const savedAt = readIsoDate(
    metadata["savedAt"],
    `${path}.savedAt`,
  );

  if (Date.parse(savedAt) < Date.parse(createdAt)) {
    fail(
      "INVALID_DATA",
      `${path}.savedAt`,
      "The saved date cannot precede the creation date.",
    );
  }

  return {
    documentId,
    createdAt,
    savedAt,
  };
}

function parseEditorState(
  source: unknown,
  projectState: ProjectState,
  path: string,
): NativeEditorState {
  const editor = readRecord(source, path);
  const selectedInstrumentSource = editor["selectedInstrumentId"];
  const selectedInstrumentId = selectedInstrumentSource === null
    ? null
    : readNonEmptyString(
        selectedInstrumentSource,
        `${path}.selectedInstrumentId`,
        MAXIMUM_ID_LENGTH,
      );

  if (
    selectedInstrumentId !== null
    && projectState.projectInstrumentsById[selectedInstrumentId] === undefined
  ) {
    fail(
      "INVALID_DATA",
      `${path}.selectedInstrumentId`,
      "The selected instrument does not exist in the project.",
    );
  }

  const selectionMode = readString(
    editor["selectionMode"],
    `${path}.selectionMode`,
    16,
  );

  if (
    selectionMode !== "replace"
    && selectionMode !== "add"
    && selectionMode !== "subtract"
  ) {
    fail(
      "INVALID_DATA",
      `${path}.selectionMode`,
      "The selection mode is not supported.",
    );
  }

  const noteColorMode = readString(
    editor["noteColorMode"],
    `${path}.noteColorMode`,
    16,
  );

  if (noteColorMode !== "instrument" && noteColorMode !== "pitch") {
    fail(
      "INVALID_DATA",
      `${path}.noteColorMode`,
      "The note color mode is not supported.",
    );
  }

  const sourceClipStates = readRecord(
    editor["clipStatesById"],
    `${path}.clipStatesById`,
  );
  assertExactRecordKeys(
    sourceClipStates,
    projectState.clipOrder,
    `${path}.clipStatesById`,
  );
  const clipStatesById: Record<ClipId, NativeClipEditorState> = {};

  for (const clipId of projectState.clipOrder) {
    const clip = projectState.clipsById[clipId];
    const clipStatePath = `${path}.clipStatesById.${clipId}`;
    const clipState = readRecord(
      sourceClipStates[clipId],
      clipStatePath,
    );

    if (clip === undefined) {
      fail("INVALID_DATA", clipStatePath, "The clip does not exist.");
    }

    clipStatesById[clipId] = {
      playheadTick: readNumberInRange(
        clipState["playheadTick"],
        `${clipStatePath}.playheadTick`,
        0,
        clip.measureCount * getTicksPerMeasure(clip.transportSettings),
      ),
      pitchSnapSettings: parsePitchSnapSettings(
        clipState["pitchSnapSettings"],
        `${clipStatePath}.pitchSnapSettings`,
      ),
      gridSettings: parseGridSettings(
        clipState["gridSettings"],
        `${clipStatePath}.gridSettings`,
      ),
      viewport: parseNativeViewport(
        clipState["viewport"],
        `${clipStatePath}.viewport`,
      ),
    };
  }

  return {
    selectedInstrumentId,
    selectionMode,
    noteColorMode,
    pitchPreviewEnabled: readBoolean(
      editor["pitchPreviewEnabled"],
      `${path}.pitchPreviewEnabled`,
    ),
    clipStatesById,
  };
}

function parsePitchSnapSettings(
  source: unknown,
  path: string,
): PitchSnapSettings {
  const settings = readRecord(source, path);
  const patternId = readString(
    settings["patternId"],
    `${path}.patternId`,
    64,
  );

  if (!isTonalPatternId(patternId)) {
    return fail(
      "INVALID_DATA",
      `${path}.patternId`,
      "The tonal pattern is not supported.",
    );
  }

  const scaleDegreeSource = settings["scaleDegreeIndex"];
  const scaleDegreeIndex = scaleDegreeSource === null
    ? null
    : readIntegerInRange(
        scaleDegreeSource,
        `${path}.scaleDegreeIndex`,
        0,
        getTonalPatternDefinition(patternId).intervals.length - 1,
      );
  const enabled = readBoolean(
    settings["enabled"],
    `${path}.enabled`,
  );
  const visualGuideEnabled = readBoolean(
    settings["visualGuideEnabled"],
    `${path}.visualGuideEnabled`,
  );

  if (enabled && !visualGuideEnabled) {
    return fail(
      "INVALID_DATA",
      `${path}.visualGuideEnabled`,
      "The tonal guide must be enabled while pitch snapping is active.",
    );
  }

  return {
    enabled,
    visualGuideEnabled,
    tonicPitchClass: readIntegerInRange(
      settings["tonicPitchClass"],
      `${path}.tonicPitchClass`,
      0,
      TONAL_SNAP_CONSTANTS.tonicOptions.length - 1,
    ),
    patternId,
    scaleDegreeIndex,
  };
}

function parseGridSettings(
  source: unknown,
  path: string,
): GridSettings {
  const settings = readRecord(source, path);
  const baseResolutionTicks = readPositiveSafeInteger(
    settings["baseResolutionTicks"],
    `${path}.baseResolutionTicks`,
  );
  const subdivisionValue = readString(
    settings["subdivision"],
    `${path}.subdivision`,
    16,
  );
  const subdivision = parseGridSubdivision(subdivisionValue);
  const supportedResolution =
    EDITOR_CONSTANTS.gridResolutionOptions.some(
      (option) => option.ticks === baseResolutionTicks,
    );

  if (subdivision === null || !supportedResolution) {
    return fail(
      "INVALID_DATA",
      path,
      "The grid configuration is not supported.",
    );
  }

  const gridSettings = createGridSettings(
    baseResolutionTicks,
    subdivision,
  );
  const storedResolutionTicks = readPositiveSafeInteger(
    settings["resolutionTicks"],
    `${path}.resolutionTicks`,
  );

  if (storedResolutionTicks !== gridSettings.resolutionTicks) {
    return fail(
      "INVALID_DATA",
      `${path}.resolutionTicks`,
      "The derived grid resolution is inconsistent.",
    );
  }

  return gridSettings;
}

function parseNativeViewport(
  source: unknown,
  path: string,
): NativeViewportState {
  const viewport = readRecord(source, path);

  return {
    zoomX: readNumberInRange(
      viewport["zoomX"],
      `${path}.zoomX`,
      VIEWPORT_CONSTANTS.minimumStoredZoom,
      VIEWPORT_CONSTANTS.maximumHorizontalZoom,
    ),
    zoomY: readNumberInRange(
      viewport["zoomY"],
      `${path}.zoomY`,
      VIEWPORT_CONSTANTS.minimumStoredZoom,
      VIEWPORT_CONSTANTS.maximumVerticalZoom,
    ),
    scrollX: readNumberInRange(
      viewport["scrollX"],
      `${path}.scrollX`,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    scrollY: readNumberInRange(
      viewport["scrollY"],
      `${path}.scrollY`,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
  };
}

function parseProjectSnapshot(
  source: unknown,
  path: string,
): ProjectState {
  const project = readRecord(source, path);
  const schemaVersion = readSafeInteger(
    project["schemaVersion"],
    `${path}.schemaVersion`,
  );

  if (schemaVersion !== PROJECT_SCHEMA_VERSION) {
    fail(
      "INVALID_DATA",
      `${path}.schemaVersion`,
      `Project schema version ${schemaVersion} is not supported.`,
    );
  }

  const title = readNonEmptyString(
    project["title"],
    `${path}.title`,
    MAXIMUM_NATIVE_PROJECT_TITLE_LENGTH,
  );
  const instrumentOrder = parseInstrumentOrder(
    project["instrumentOrder"],
    `${path}.instrumentOrder`,
  );
  const projectInstrumentsById = parseProjectInstruments(
    project["projectInstrumentsById"],
    instrumentOrder,
    `${path}.projectInstrumentsById`,
  );
  const masterBus = parseMasterBus(
    project["masterBus"],
    `${path}.masterBus`,
  );
  const clipOrder = parseClipOrder(
    project["clipOrder"],
    `${path}.clipOrder`,
  );
  const instrumentPresetOrder = parsePresetOrder(
    project["instrumentPresetOrder"],
    `${path}.instrumentPresetOrder`,
  );
  const instrumentPresetsById = parseInstrumentPresets(
    project["instrumentPresetsById"],
    instrumentPresetOrder,
    `${path}.instrumentPresetsById`,
  );
  const sourceClips = readRecord(
    project["clipsById"],
    `${path}.clipsById`,
  );
  assertExactRecordKeys(sourceClips, clipOrder, `${path}.clipsById`);
  const clipsById: Record<ClipId, Clip> = {};

  for (const clipId of clipOrder) {
    clipsById[clipId] = parseClip(
      sourceClips[clipId],
      clipId,
      instrumentOrder,
      instrumentPresetsById,
      `${path}.clipsById.${clipId}`,
    );
  }

  const activeClipId = readNonEmptyString(
    project["activeClipId"],
    `${path}.activeClipId`,
    MAXIMUM_ID_LENGTH,
  );

  if (clipsById[activeClipId] === undefined) {
    fail(
      "INVALID_DATA",
      `${path}.activeClipId`,
      "The active clip does not exist.",
    );
  }

  const projectState: ProjectState = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    revision: 0,
    title,
    projectInstrumentsById,
    instrumentOrder,
    instrumentPresetsById,
    instrumentPresetOrder,
    clipsById,
    clipOrder,
    activeClipId,
    masterBus,
  };
  return projectState;
}

function parseClipOrder(
  source: unknown,
  path: string,
): readonly ClipId[] {
  const values = readArray(source, path);

  if (
    values.length < 1
    || values.length > PROJECT_CONSTANTS.maximumClipCount
  ) {
    fail(
      "INVALID_DATA",
      path,
      `A project must contain between 1 and ${PROJECT_CONSTANTS.maximumClipCount} clips.`,
    );
  }

  const clipOrder: ClipId[] = [];
  const uniqueIds = new Set<ClipId>();

  for (let index = 0; index < values.length; index += 1) {
    const clipId = readNonEmptyString(
      values[index],
      `${path}[${index}]`,
      MAXIMUM_ID_LENGTH,
    );

    if (uniqueIds.has(clipId)) {
      fail(
        "INVALID_DATA",
        `${path}[${index}]`,
        "Clip IDs must be unique.",
      );
    }

    uniqueIds.add(clipId);
    clipOrder.push(clipId);
  }

  return clipOrder;
}

function parseClip(
  source: unknown,
  clipId: ClipId,
  instrumentOrder: readonly InstrumentId[],
  presetsById: Readonly<Record<PresetId, InstrumentPreset>>,
  path: string,
): Clip {
  const clip = readRecord(source, path);
  const storedId = readNonEmptyString(
    clip["id"],
    `${path}.id`,
    MAXIMUM_ID_LENGTH,
  );

  if (storedId !== clipId) {
    fail("INVALID_DATA", `${path}.id`, "Clip ID must match its record key.");
  }

  const name = readNonEmptyString(
    clip["name"],
    `${path}.name`,
    PROJECT_CONSTANTS.maximumClipNameLength,
  );
  const measureCount = readIntegerInRange(
    clip["measureCount"],
    `${path}.measureCount`,
    MINIMUM_MEASURE_COUNT,
    MAXIMUM_MEASURE_COUNT,
  );
  const transportSettings = parseTransport(
    clip["transportSettings"],
    `${path}.transportSettings`,
  );
  const durationValidation = validateProjectDuration(
    measureCount,
    transportSettings,
  );

  if (!durationValidation.valid) {
    fail(
      "INVALID_DATA",
      `${path}.measureCount`,
      durationValidation.issues[0]?.message ?? "Clip duration is invalid.",
    );
  }

  const durationTicks = measureCount * getTicksPerMeasure(transportSettings);
  const tracksByInstrumentId = parseTracks(
    clip["tracksByInstrumentId"],
    instrumentOrder,
    durationTicks,
    `${path}.tracksByInstrumentId`,
  );
  const instrumentStatesById = parseClipInstrumentStates(
    clip["instrumentStatesById"],
    instrumentOrder,
    presetsById,
    `${path}.instrumentStatesById`,
  );
  const parsedClip: Clip = {
    id: clipId,
    name,
    measureCount,
    tracksByInstrumentId,
    instrumentStatesById,
    transportSettings,
  };

  assertTransportWithinClip(parsedClip, path);
  return parsedClip;
}

function parseInstrumentOrder(
  source: unknown,
  path: string,
): readonly InstrumentId[] {
  const values = readArray(source, path);

  if (values.length > MAXIMUM_INSTRUMENT_COUNT) {
    fail(
      "INVALID_DATA",
      path,
      `A project cannot contain more than ${MAXIMUM_INSTRUMENT_COUNT} instruments.`,
    );
  }

  const instrumentOrder: InstrumentId[] = [];
  const uniqueInstrumentIds = new Set<InstrumentId>();

  for (
    let instrumentIndex = 0;
    instrumentIndex < values.length;
    instrumentIndex += 1
  ) {
    const instrumentId = readNonEmptyString(
      values[instrumentIndex],
      `${path}[${instrumentIndex}]`,
      MAXIMUM_ID_LENGTH,
    );

    if (uniqueInstrumentIds.has(instrumentId)) {
      fail(
        "INVALID_DATA",
        `${path}[${instrumentIndex}]`,
        `ProjectInstrument ID "${instrumentId}" appears more than once.`,
      );
    }

    uniqueInstrumentIds.add(instrumentId);
    instrumentOrder.push(instrumentId);
  }

  return instrumentOrder;
}

function parsePresetOrder(
  source: unknown,
  path: string,
): readonly PresetId[] {
  const values = readArray(source, path);

  if (
    values.length < 1
    || values.length > MAXIMUM_INSTRUMENT_COUNT
  ) {
    fail(
      "INVALID_DATA",
      path,
      `A project must contain between 1 and ${MAXIMUM_INSTRUMENT_COUNT} presets.`,
    );
  }

  const presetOrder: PresetId[] = [];
  const uniquePresetIds = new Set<PresetId>();

  for (let presetIndex = 0; presetIndex < values.length; presetIndex += 1) {
    const presetId = readNonEmptyString(
      values[presetIndex],
      `${path}[${presetIndex}]`,
      MAXIMUM_ID_LENGTH,
    );

    if (uniquePresetIds.has(presetId)) {
      fail(
        "INVALID_DATA",
        `${path}[${presetIndex}]`,
        `Preset ID "${presetId}" appears more than once.`,
      );
    }

    uniquePresetIds.add(presetId);
    presetOrder.push(presetId);
  }

  return presetOrder;
}

function parseInstrumentPresets(
  source: unknown,
  presetOrder: readonly PresetId[],
  path: string,
): Readonly<Record<PresetId, InstrumentPreset>> {
  const sourcePresets = readRecord(source, path);

  assertExactRecordKeys(sourcePresets, presetOrder, path);
  const presetsById = Object.create(null) as Record<
    PresetId,
    InstrumentPreset
  >;

  for (const presetId of presetOrder) {
    const presetPath = `${path}.${presetId}`;
    const sourcePreset = readRecord(sourcePresets[presetId], presetPath);
    const storedId = readNonEmptyString(
      sourcePreset["id"],
      `${presetPath}.id`,
      MAXIMUM_ID_LENGTH,
    );

    if (storedId !== presetId) {
      fail(
        "INVALID_DATA",
        `${presetPath}.id`,
        "Preset ID must match its record key.",
      );
    }

    const kind = readString(
      sourcePreset["kind"],
      `${presetPath}.kind`,
      MAXIMUM_NAME_LENGTH,
    );
    const config = parseInstrument(
      sourcePreset["config"],
      `${presetPath}.config`,
    );

    if (kind !== "subtractive" || kind !== config.kind) {
      fail(
        "INVALID_DATA",
        `${presetPath}.kind`,
        `Preset kind "${kind}" is not supported or does not match its configuration.`,
      );
    }

    const preset: InstrumentPreset = {
      id: storedId,
      name: readNonEmptyString(
        sourcePreset["name"],
        `${presetPath}.name`,
        MAXIMUM_NAME_LENGTH,
      ),
      kind,
      config,
    };
    const validation = validateInstrumentPreset(preset);

    if (!validation.valid) {
      const issue = validation.issues[0];

      fail(
        "INVALID_DATA",
        issue === undefined
          ? presetPath
          : `${presetPath}.${issue.path}`,
        issue?.message ?? "Instrument preset is invalid.",
      );
    }

    presetsById[presetId] = preset;
  }

  return presetsById;
}

function parseClipInstrumentStates(
  source: unknown,
  instrumentOrder: readonly InstrumentId[],
  presetsById: Readonly<Record<PresetId, InstrumentPreset>>,
  path: string,
): Readonly<Record<InstrumentId, ClipInstrumentState>> {
  const sourceStates = readRecord(source, path);

  assertExactRecordKeys(sourceStates, instrumentOrder, path);
  const states = Object.create(null) as Record<InstrumentId, ClipInstrumentState>;

  for (const instrumentId of instrumentOrder) {
    const statePath = `${path}.${instrumentId}`;
    const state = readRecord(sourceStates[instrumentId], statePath);

    const presetId = readNonEmptyString(
      state["presetId"],
      `${statePath}.presetId`,
      MAXIMUM_ID_LENGTH,
    );

    if (presetsById[presetId] === undefined) {
      fail(
        "INVALID_DATA",
        `${statePath}.presetId`,
        `Preset "${presetId}" does not exist.`,
      );
    }

    states[instrumentId] = {
      gain: readNumberInRange(
        state["gain"],
        `${statePath}.gain`,
        INSTRUMENT_CONSTANTS.minimumGain,
        INSTRUMENT_CONSTANTS.maximumGain,
      ),
      muted: readBoolean(state["muted"], `${statePath}.muted`),
      locked: readBoolean(state["locked"], `${statePath}.locked`),
      solo: readBoolean(state["solo"], `${statePath}.solo`),
      presetId,
    };
  }

  return states;
}

function parseProjectInstruments(
  source: unknown,
  instrumentOrder: readonly InstrumentId[],
  path: string,
): Readonly<Record<InstrumentId, ProjectInstrument>> {
  const sourceInstruments = readRecord(source, path);
  assertExactRecordKeys(sourceInstruments, instrumentOrder, path);
  const projectInstrumentsById =
    Object.create(null) as Record<InstrumentId, ProjectInstrument>;

  for (
    let instrumentIndex = 0;
    instrumentIndex < instrumentOrder.length;
    instrumentIndex += 1
  ) {
    const instrumentId = instrumentOrder[instrumentIndex];

    if (instrumentId !== undefined) {
      projectInstrumentsById[instrumentId] = parseProjectInstrument(
        sourceInstruments[instrumentId],
        instrumentId,
        `${path}.${instrumentId}`,
      );
    }
  }

  return projectInstrumentsById;
}

function parseProjectInstrument(
  source: unknown,
  expectedInstrumentId: InstrumentId,
  path: string,
): ProjectInstrument {
  const instrument = readRecord(source, path);
  const id = readNonEmptyString(
    instrument["id"],
    `${path}.id`,
    MAXIMUM_ID_LENGTH,
  );

  if (id !== expectedInstrumentId) {
    fail(
      "INVALID_DATA",
      `${path}.id`,
      `ProjectInstrument ID "${id}" must match its record key "${expectedInstrumentId}".`,
    );
  }

  const color = readString(
    instrument["color"],
    `${path}.color`,
    32,
  );

  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    fail(
      "INVALID_DATA",
      `${path}.color`,
      "ProjectInstrument color must use the #RRGGBB format.",
    );
  }

  const parsedInstrument: ProjectInstrument = {
    id,
    name: readNonEmptyString(
      instrument["name"],
      `${path}.name`,
      MAXIMUM_NAME_LENGTH,
    ),
    color,
    pan: readNumberInRange(
      instrument["pan"],
      `${path}.pan`,
      -1,
      1,
    ),
    effects: parseEffects(instrument["effects"], `${path}.effects`),
    generativeRules: parseGenerativeRules(
      instrument["generativeRules"],
      `${path}.generativeRules`,
    ),
    interpretation: parseProjectInstrumentInterpretation(
      instrument["interpretation"],
      `${path}.interpretation`,
    ),
  };
  const validation = validateProjectInstrument(parsedInstrument);

  if (!validation.valid) {
    const issue = validation.issues[0];

    fail(
      "INVALID_DATA",
      issue === undefined ? path : `${path}.${issue.path}`,
      issue?.message ?? "ProjectInstrument configuration is invalid.",
    );
  }

  return parsedInstrument;
}

function parseInstrument(
  source: unknown,
  path: string,
): InstrumentConfig {
  const instrument = readRecord(source, path);
  const kind = readString(
    instrument["kind"],
    `${path}.kind`,
    MAXIMUM_NAME_LENGTH,
  );

  if (kind !== "subtractive") {
    return fail(
      "INVALID_DATA",
      `${path}.kind`,
      `Instrument kind "${kind}" is not supported.`
        + " Only subtractive instruments are supported.",
    );
  }

  return parseSubtractiveSynth(instrument, path);
}

function parseSubtractiveSynth(
  instrument: UnknownRecord,
  path: string,
): SubtractiveSynthConfig {
  return {
    kind: "subtractive",
    oscillatorWaveform: parseWaveform(
      instrument["oscillatorWaveform"],
      `${path}.oscillatorWaveform`,
    ),
    oscillatorDetuneCents: readFiniteNumber(
      instrument["oscillatorDetuneCents"],
      `${path}.oscillatorDetuneCents`,
    ),
    polyphony: readIntegerInRange(
      instrument["polyphony"],
      `${path}.polyphony`,
      MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
      MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
    ),
    pulseWidth: readNumberInRange(
      instrument["pulseWidth"],
      `${path}.pulseWidth`,
      INSTRUMENT_CONSTANTS.minimumPulseWidth,
      INSTRUMENT_CONSTANTS.maximumPulseWidth,
    ),
    envelope: parseEnvelope(
      instrument["envelope"],
      `${path}.envelope`,
    ),
    filterCutoffHz: readNumberInRange(
      instrument["filterCutoffHz"],
      `${path}.filterCutoffHz`,
      INSTRUMENT_CONSTANTS.minimumFilterCutoffHz,
      INSTRUMENT_CONSTANTS.maximumFilterCutoffHz,
    ),
    filterResonance: readNumberInRange(
      instrument["filterResonance"],
      `${path}.filterResonance`,
      INSTRUMENT_CONSTANTS.minimumFilterResonance,
      INSTRUMENT_CONSTANTS.maximumFilterResonance,
    ),
    filterEnvelopeAmountOctaves: readNumberInRange(
      instrument["filterEnvelopeAmountOctaves"],
      `${path}.filterEnvelopeAmountOctaves`,
      INSTRUMENT_CONSTANTS.minimumFilterEnvelopeAmountOctaves,
      INSTRUMENT_CONSTANTS.maximumFilterEnvelopeAmountOctaves,
    ),
    filterEnvelope: parseEnvelope(
      instrument["filterEnvelope"],
      `${path}.filterEnvelope`,
    ),
  };
}

function parseWaveform(
  source: unknown,
  path: string,
): OscillatorWaveform {
  const waveform = readString(source, path, 16);

  switch (waveform) {
    case "sine":
    case "square":
    case "sawtooth":
    case "triangle":
      return waveform;
    default:
      return fail(
        "INVALID_DATA",
        path,
        `Oscillator waveform "${waveform}" is not supported.`,
      );
  }
}

function parseEnvelope(
  source: unknown,
  path: string,
): AdsrEnvelope {
  const envelope = readRecord(source, path);

  return {
    attackSeconds: readNonNegativeNumber(
      envelope["attackSeconds"],
      `${path}.attackSeconds`,
    ),
    decaySeconds: readNonNegativeNumber(
      envelope["decaySeconds"],
      `${path}.decaySeconds`,
    ),
    sustainLevel: readNumberInRange(
      envelope["sustainLevel"],
      `${path}.sustainLevel`,
      0,
      1,
    ),
    releaseSeconds: readNonNegativeNumber(
      envelope["releaseSeconds"],
      `${path}.releaseSeconds`,
    ),
  };
}

function parseEffects(
  source: unknown,
  path: string,
): readonly EffectDescriptor[] {
  const values = readBoundedArray(
    source,
    path,
    MAXIMUM_DESCRIPTOR_COUNT,
  );
  const effects: EffectDescriptor[] = [];
  const ids = new Set<string>();

  for (
    let effectIndex = 0;
    effectIndex < values.length;
    effectIndex += 1
  ) {
    const effectPath = `${path}[${effectIndex}]`;
    const effect = readRecord(values[effectIndex], effectPath);
    const id = readUniqueDescriptorId(effect, ids, effectPath);

    effects.push({
      id,
      kind: readNonEmptyString(
        effect["kind"],
        `${effectPath}.kind`,
        MAXIMUM_NAME_LENGTH,
      ),
      enabled: readBoolean(
        effect["enabled"],
        `${effectPath}.enabled`,
      ),
      parameters: parseParameters(
        effect["parameters"],
        `${effectPath}.parameters`,
      ),
    });
  }

  return effects;
}

function parseGenerativeRules(
  source: unknown,
  path: string,
): readonly GenerativeRuleDescriptor[] {
  const values = readBoundedArray(
    source,
    path,
    MAXIMUM_DESCRIPTOR_COUNT,
  );
  const rules: GenerativeRuleDescriptor[] = [];
  const ids = new Set<string>();

  for (
    let ruleIndex = 0;
    ruleIndex < values.length;
    ruleIndex += 1
  ) {
    const rulePath = `${path}[${ruleIndex}]`;
    const rule = readRecord(values[ruleIndex], rulePath);
    const id = readUniqueDescriptorId(rule, ids, rulePath);

    rules.push({
      id,
      kind: readNonEmptyString(
        rule["kind"],
        `${rulePath}.kind`,
        MAXIMUM_NAME_LENGTH,
      ),
      enabled: readBoolean(
        rule["enabled"],
        `${rulePath}.enabled`,
      ),
      parameters: parseParameters(
        rule["parameters"],
        `${rulePath}.parameters`,
      ),
    });
  }

  return rules;
}

function readUniqueDescriptorId(
  descriptor: UnknownRecord,
  ids: Set<string>,
  path: string,
): string {
  const id = readNonEmptyString(
    descriptor["id"],
    `${path}.id`,
    MAXIMUM_ID_LENGTH,
  );

  if (ids.has(id)) {
    fail(
      "INVALID_DATA",
      `${path}.id`,
      `Descriptor ID "${id}" appears more than once.`,
    );
  }

  ids.add(id);
  return id;
}

function parseParameters(
  source: unknown,
  path: string,
): Readonly<Record<string, EffectParameterValue>> {
  const sourceParameters = readRecord(source, path);
  const parameterEntries = Object.entries(sourceParameters);

  if (parameterEntries.length > MAXIMUM_PARAMETER_COUNT) {
    fail(
      "INVALID_DATA",
      path,
      `A descriptor cannot contain more than ${MAXIMUM_PARAMETER_COUNT} parameters.`,
    );
  }

  const parameters =
    Object.create(null) as Record<string, JsonPrimitive>;

  for (const [key, value] of parameterEntries) {
    if (key.length === 0 || key.length > MAXIMUM_NAME_LENGTH) {
      fail(
        "INVALID_DATA",
        `${path}.${key}`,
        "Parameter names must be non-empty and bounded.",
      );
    }

    if (
      typeof value !== "string"
      && typeof value !== "number"
      && typeof value !== "boolean"
    ) {
      fail(
        "INVALID_DATA",
        `${path}.${key}`,
        "Parameters must be strings, finite numbers, or booleans.",
      );
    }

    if (typeof value === "number" && !Number.isFinite(value)) {
      fail(
        "INVALID_DATA",
        `${path}.${key}`,
        "Numeric parameters must be finite.",
      );
    }

    parameters[key] = value;
  }

  return parameters;
}

function parseProjectInstrumentInterpretation(
  source: unknown,
  path: string,
): ProjectInstrumentInterpretation {
  const interpretation = readRecord(source, path);

  return {
    transposeSemitones: readSafeInteger(
      interpretation["transposeSemitones"],
      `${path}.transposeSemitones`,
    ),
    timingOffsetTicks: readSafeInteger(
      interpretation["timingOffsetTicks"],
      `${path}.timingOffsetTicks`,
    ),
    gateRatio: readPositiveNumber(
      interpretation["gateRatio"],
      `${path}.gateRatio`,
    ),
    velocityScale: readNonNegativeNumber(
      interpretation["velocityScale"],
      `${path}.velocityScale`,
    ),
    probability: readNumberInRange(
      interpretation["probability"],
      `${path}.probability`,
      0,
      1,
    ),
  };
}

function parseTransport(
  source: unknown,
  path: string,
): TransportState {
  const transport = readRecord(source, path);
  const timeSignature = readRecord(
    transport["timeSignature"],
    `${path}.timeSignature`,
  );
  const denominator = readSafeInteger(
    timeSignature["denominator"],
    `${path}.timeSignature.denominator`,
  );

  if (![1, 2, 4, 8, 16, 32].includes(denominator)) {
    fail(
      "INVALID_DATA",
      `${path}.timeSignature.denominator`,
      "Time signature denominator is not supported.",
    );
  }

  const numerator = readPositiveSafeInteger(
    timeSignature["numerator"],
    `${path}.timeSignature.numerator`,
  );
  const ppqn = readPositiveSafeInteger(
    transport["ppqn"],
    `${path}.ppqn`,
  );
  const loop = parseLoop(transport["loop"], `${path}.loop`);
  const loopEnabled = readBoolean(
    transport["loopEnabled"],
    `${path}.loopEnabled`,
  );

  const anchorAudioTimeSource =
    transport["anchorAudioTimeSeconds"];

  if (anchorAudioTimeSource !== null) {
    fail(
      "INVALID_DATA",
      `${path}.anchorAudioTimeSeconds`,
      "Runtime audio timing cannot be stored in a project file.",
    );
  }

  const parsedTransport: TransportState = {
    bpm: readPositiveNumber(transport["bpm"], `${path}.bpm`),
    timeSignature: {
      numerator,
      denominator: denominator as
        | 1
        | 2
        | 4
        | 8
        | 16
        | 32,
    },
    loop,
    loopEnabled,
    ppqn,
    anchorTick: readNonNegativeSafeInteger(
      transport["anchorTick"],
      `${path}.anchorTick`,
    ),
    anchorAudioTimeSeconds: null,
  };
  const validation = validateTransportState(parsedTransport);

  if (!validation.valid) {
    fail(
      "INVALID_DATA",
      path,
      validation.issues[0]?.message
        ?? "Transport settings are invalid.",
    );
  }

  return parsedTransport;
}

function parseMasterBus(
  source: unknown,
  path: string,
): MasterBusState {
  const masterBus = readRecord(source, path);

  return {
    gain: readNumberInRange(
      masterBus["gain"],
      `${path}.gain`,
      MINIMUM_MASTER_GAIN,
      MAXIMUM_MASTER_GAIN,
    ),
    muted: readBoolean(masterBus["muted"], `${path}.muted`),
    tuningFrequencyHz: readNumberInRange(
      masterBus["tuningFrequencyHz"],
      `${path}.tuningFrequencyHz`,
      MINIMUM_MASTER_TUNING_FREQUENCY_HZ,
      MAXIMUM_MASTER_TUNING_FREQUENCY_HZ,
    ),
  };
}

function parseLoop(
  source: unknown,
  path: string,
): LoopRegion {
  const loop = readRecord(source, path);

  return {
    startTick: readNonNegativeSafeInteger(
      loop["startTick"],
      `${path}.startTick`,
    ),
    endTick: readNonNegativeSafeInteger(
      loop["endTick"],
      `${path}.endTick`,
    ),
  };
}

function parseTracks(
  source: unknown,
  instrumentOrder: readonly InstrumentId[],
  projectDurationTicks: number,
  path: string,
): Readonly<Record<InstrumentId, Track>> {
  const sourceTracks = readRecord(source, path);

  assertExactRecordKeys(sourceTracks, instrumentOrder, path);
  const tracksByInstrumentId =
    Object.create(null) as Record<InstrumentId, Track>;
  const globalNoteIds = new Set<NoteId>();
  let totalNoteCount = 0;

  for (
    let instrumentIndex = 0;
    instrumentIndex < instrumentOrder.length;
    instrumentIndex += 1
  ) {
    const instrumentId = instrumentOrder[instrumentIndex];

    if (instrumentId === undefined) {
      continue;
    }

    const trackPath = `${path}.${instrumentId}`;
    const track = readRecord(sourceTracks[instrumentId], trackPath);
    const trackInstrumentId = readNonEmptyString(
      track["instrumentId"],
      `${trackPath}.instrumentId`,
      MAXIMUM_ID_LENGTH,
    );

    if (trackInstrumentId !== instrumentId) {
      fail(
        "INVALID_DATA",
        `${trackPath}.instrumentId`,
        `Track instrument ID "${trackInstrumentId}" must match "${instrumentId}".`,
      );
    }

    const notesById = parseNotes(
      track["notesById"],
      instrumentId,
      projectDurationTicks,
      globalNoteIds,
      trackPath,
    );

    totalNoteCount += Object.keys(notesById).length;

    if (totalNoteCount > MAXIMUM_NOTE_COUNT) {
      fail(
        "INVALID_DATA",
        path,
        `A project cannot contain more than ${MAXIMUM_NOTE_COUNT} notes.`,
      );
    }

    tracksByInstrumentId[instrumentId] = {
      instrumentId,
      notesById,
    };
  }

  return tracksByInstrumentId;
}

function parseNotes(
  source: unknown,
  instrumentId: InstrumentId,
  projectDurationTicks: number,
  globalNoteIds: Set<NoteId>,
  trackPath: string,
): Readonly<Record<NoteId, Note>> {
  const sourceNotes = readRecord(
    source,
    `${trackPath}.notesById`,
  );
  const notesById =
    Object.create(null) as Record<NoteId, Note>;
  for (const [noteKey, sourceNote] of Object.entries(sourceNotes)) {
    const notePath = `${trackPath}.notesById.${noteKey}`;
    const noteRecord = readRecord(sourceNote, notePath);
    const note: Note = {
      id: readNonEmptyString(
        noteRecord["id"],
        `${notePath}.id`,
        MAXIMUM_ID_LENGTH,
      ),
      pitch: readSafeInteger(
        noteRecord["pitch"],
        `${notePath}.pitch`,
      ),
      startTick: readNonNegativeSafeInteger(
        noteRecord["startTick"],
        `${notePath}.startTick`,
      ),
      durationTicks: readPositiveSafeInteger(
        noteRecord["durationTicks"],
        `${notePath}.durationTicks`,
      ),
      velocity: readSafeInteger(
        noteRecord["velocity"],
        `${notePath}.velocity`,
      ),
      enabled: readBoolean(
        noteRecord["enabled"],
        `${notePath}.enabled`,
      ),
      instrumentId: readNonEmptyString(
        noteRecord["instrumentId"],
        `${notePath}.instrumentId`,
        MAXIMUM_ID_LENGTH,
      ),
    };

    if (note.id !== noteKey) {
      fail(
        "INVALID_DATA",
        `${notePath}.id`,
        `Note ID "${note.id}" must match its record key "${noteKey}".`,
      );
    }

    if (globalNoteIds.has(note.id)) {
      fail(
        "INVALID_DATA",
        `${notePath}.id`,
        `Note ID "${note.id}" must be unique within its clip.`,
      );
    }

    const validation = validateNoteForTrack(note, instrumentId);

    if (!validation.valid) {
      fail(
        "INVALID_DATA",
        notePath,
        validation.issues[0]?.message ?? "Note data is invalid.",
      );
    }

    const endTick = note.startTick + note.durationTicks;

    if (
      !Number.isSafeInteger(endTick)
      || endTick > projectDurationTicks
    ) {
      fail(
        "INVALID_DATA",
        notePath,
        `Note "${note.id}" exceeds the clip duration.`,
      );
    }

    globalNoteIds.add(note.id);
    notesById[note.id] = note;
  }

  return notesById;
}

function assertTransportWithinClip(
  clip: Clip,
  clipPath: string,
): void {
  const durationTicks =
    clip.measureCount * getTicksPerMeasure(clip.transportSettings);
  const transport = clip.transportSettings;

  if (transport.anchorTick > durationTicks) {
    fail(
      "INVALID_DATA",
      `${clipPath}.transportSettings.anchorTick`,
      "Transport anchor exceeds the clip duration.",
    );
  }

  if (
    transport.loop.endTick > durationTicks
  ) {
    fail(
      "INVALID_DATA",
      `${clipPath}.transportSettings.loop`,
      "Loop region exceeds the clip duration.",
    );
  }
}

function assertExactRecordKeys(
  record: UnknownRecord,
  expectedKeys: readonly string[],
  path: string,
): void {
  const actualKeys = Object.keys(record);
  const expectedKeySet = new Set(expectedKeys);

  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key) => !expectedKeySet.has(key))
  ) {
    fail(
      "INVALID_DATA",
      path,
      "Record keys must exactly match the instrument order.",
    );
  }
}

function readRecord(
  source: unknown,
  path: string,
): UnknownRecord {
  if (
    typeof source !== "object"
    || source === null
    || Array.isArray(source)
  ) {
    return fail(
      "INVALID_DATA",
      path,
      "Expected an object.",
    );
  }

  return source as UnknownRecord;
}

function readArray(
  source: unknown,
  path: string,
): readonly unknown[] {
  if (!Array.isArray(source)) {
    return fail(
      "INVALID_DATA",
      path,
      "Expected an array.",
    );
  }

  return source;
}

function readBoundedArray(
  source: unknown,
  path: string,
  maximumLength: number,
): readonly unknown[] {
  const values = readArray(source, path);

  if (values.length > maximumLength) {
    fail(
      "INVALID_DATA",
      path,
      `Array cannot contain more than ${maximumLength} values.`,
    );
  }

  return values;
}

function readString(
  source: unknown,
  path: string,
  maximumLength: number,
): string {
  if (
    typeof source !== "string"
    || source.length > maximumLength
  ) {
    return fail(
      "INVALID_DATA",
      path,
      `Expected a string no longer than ${maximumLength} characters.`,
    );
  }

  return source;
}

function readNonEmptyString(
  source: unknown,
  path: string,
  maximumLength: number,
): string {
  const value = readString(source, path, maximumLength);

  if (value.trim().length === 0) {
    fail(
      "INVALID_DATA",
      path,
      "Expected a non-empty string.",
    );
  }

  return value;
}

function readIsoDate(
  source: unknown,
  path: string,
): string {
  const value = readString(source, path, 64);
  const timestamp = Date.parse(value);

  if (
    !Number.isFinite(timestamp)
    || new Date(timestamp).toISOString() !== value
  ) {
    fail(
      "INVALID_DATA",
      path,
      "Expected a valid ISO date string.",
    );
  }

  return value;
}

function readBoolean(
  source: unknown,
  path: string,
): boolean {
  if (typeof source !== "boolean") {
    return fail(
      "INVALID_DATA",
      path,
      "Expected a boolean.",
    );
  }

  return source;
}

function readFiniteNumber(
  source: unknown,
  path: string,
): number {
  if (typeof source !== "number" || !Number.isFinite(source)) {
    return fail(
      "INVALID_DATA",
      path,
      "Expected a finite number.",
    );
  }

  return source;
}

function readNonNegativeNumber(
  source: unknown,
  path: string,
): number {
  const value = readFiniteNumber(source, path);

  if (value < 0) {
    fail(
      "INVALID_DATA",
      path,
      "Expected a non-negative number.",
    );
  }

  return value;
}

function readPositiveNumber(
  source: unknown,
  path: string,
): number {
  const value = readFiniteNumber(source, path);

  if (value <= 0) {
    fail(
      "INVALID_DATA",
      path,
      "Expected a positive number.",
    );
  }

  return value;
}

function readNumberInRange(
  source: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  const value = readFiniteNumber(source, path);

  if (value < minimum || value > maximum) {
    fail(
      "INVALID_DATA",
      path,
      `Expected a number between ${minimum} and ${maximum}.`,
    );
  }

  return value;
}

function readSafeInteger(
  source: unknown,
  path: string,
): number {
  if (
    typeof source !== "number"
    || !Number.isSafeInteger(source)
  ) {
    return fail(
      "INVALID_DATA",
      path,
      "Expected a safe integer.",
    );
  }

  return source;
}

function readNonNegativeSafeInteger(
  source: unknown,
  path: string,
): number {
  return readIntegerInRange(
    source,
    path,
    0,
    Number.MAX_SAFE_INTEGER,
  );
}

function readPositiveSafeInteger(
  source: unknown,
  path: string,
): number {
  return readIntegerInRange(
    source,
    path,
    1,
    Number.MAX_SAFE_INTEGER,
  );
}

function readIntegerInRange(
  source: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  const value = readSafeInteger(source, path);

  if (value < minimum || value > maximum) {
    fail(
      "INVALID_DATA",
      path,
      `Expected an integer between ${minimum} and ${maximum}.`,
    );
  }

  return value;
}

function fail(
  code: NativeProjectFileErrorCode,
  path: string,
  message: string,
): never {
  throw new NativeProjectFileError(code, path, message);
}
