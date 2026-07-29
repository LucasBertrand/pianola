import type {
  AdsrEnvelope,
  EffectDescriptor,
  EffectParameterValue,
  GenerativeRuleDescriptor,
  InstrumentConfig,
  LoopRegion,
  MasterBusState,
  Note,
  NoteId,
  OscillatorWaveform,
  ProjectState,
  SubtractiveSynthConfig,
  Track,
  TransportState,
  Voice,
  VoiceId,
  VoiceInterpretation,
} from "../domain/model";
import {
  createDefaultMasterBusState,
  DEFAULT_INSTRUMENT_POLYPHONY,
  getProjectDurationTicks,
  MAXIMUM_INSTRUMENT_POLYPHONY,
  MAXIMUM_MASTER_GAIN,
  MAXIMUM_DESCRIPTOR_PARAMETER_COUNT,
  MAXIMUM_ENTITY_ID_LENGTH,
  MAXIMUM_MEASURE_COUNT,
  MAXIMUM_PROJECT_NOTE_COUNT,
  MAXIMUM_PROJECT_TITLE_LENGTH,
  MAXIMUM_PROJECT_VOICE_COUNT,
  MAXIMUM_VOICE_DESCRIPTOR_COUNT,
  MAXIMUM_VOICE_NAME_LENGTH,
  MINIMUM_MEASURE_COUNT,
  MINIMUM_INSTRUMENT_POLYPHONY,
  MINIMUM_MASTER_GAIN,
  PROJECT_SCHEMA_VERSION,
} from "../domain/model";
import {
  validateNoteForTrack,
  validateProjectDuration,
  validateTransportState,
  validateVoice,
} from "../domain/validation";

export const NATIVE_PROJECT_FILE_FORMAT =
  "com.piano-roll.native-project" as const;
export const NATIVE_PROJECT_FILE_VERSION = 5 as const;
export const NATIVE_PROJECT_FILE_EXTENSION = ".pianoroll" as const;
export const MAXIMUM_NATIVE_PROJECT_FILE_BYTES =
  32 * 1024 * 1024;
export const MAXIMUM_NATIVE_PROJECT_TITLE_LENGTH =
  MAXIMUM_PROJECT_TITLE_LENGTH;

const MAXIMUM_VOICE_COUNT = MAXIMUM_PROJECT_VOICE_COUNT;
const MAXIMUM_NOTE_COUNT = MAXIMUM_PROJECT_NOTE_COUNT;
const MAXIMUM_NAME_LENGTH = MAXIMUM_VOICE_NAME_LENGTH;
const MAXIMUM_ID_LENGTH = MAXIMUM_ENTITY_ID_LENGTH;
const MAXIMUM_DESCRIPTOR_COUNT = MAXIMUM_VOICE_DESCRIPTOR_COUNT;
const MAXIMUM_PARAMETER_COUNT = MAXIMUM_DESCRIPTOR_PARAMETER_COUNT;
const LEGACY_NATIVE_PROJECT_FILE_VERSION = 1 as const;
const LEGACY_PROJECT_SCHEMA_VERSION = 1;
const PREVIOUS_NATIVE_PROJECT_FILE_VERSION = 2 as const;
const PREVIOUS_PROJECT_SCHEMA_VERSION = 2;
const MASTER_BUS_NATIVE_PROJECT_FILE_VERSION = 3 as const;
const MASTER_BUS_PROJECT_SCHEMA_VERSION = 3;
const POLYPHONY_NATIVE_PROJECT_FILE_VERSION = 4 as const;
const POLYPHONY_PROJECT_SCHEMA_VERSION = 4;

type JsonPrimitive = string | number | boolean;
type UnknownRecord = Readonly<Record<string, unknown>>;
type NativeVoiceV1ToV3 = Omit<Voice, "instrument"> & {
  readonly instrument: Omit<SubtractiveSynthConfig, "polyphony">;
};
type NativeMasterBusV3ToV4 = Omit<MasterBusState, "muted">;

export interface NativeProjectFileMetadata {
  readonly documentId: string;
  readonly createdAt: string;
  readonly savedAt: string;
}

export type NativeTransportStateV1 = Omit<
  TransportState,
  "anchorAudioTimeSeconds" | "loop" | "loopEnabled"
> & {
  readonly loop: LoopRegion | null;
  readonly anchorAudioTimeSeconds: null;
};

export type NativeTransportStateV2 = Omit<
  TransportState,
  "anchorAudioTimeSeconds"
> & {
  readonly anchorAudioTimeSeconds: null;
};

export interface NativeProjectSnapshotV1 {
  readonly schemaVersion: number;
  readonly title: string;
  readonly measureCount: number;
  readonly voicesById: Readonly<Record<VoiceId, NativeVoiceV1ToV3>>;
  readonly voiceOrder: readonly VoiceId[];
  readonly tracksByVoiceId: Readonly<Record<VoiceId, Track>>;
  readonly transportSettings: NativeTransportStateV1;
}

export interface NativeProjectFileV1 {
  readonly format: typeof NATIVE_PROJECT_FILE_FORMAT;
  readonly formatVersion: typeof LEGACY_NATIVE_PROJECT_FILE_VERSION;
  readonly metadata: NativeProjectFileMetadata;
  readonly project: NativeProjectSnapshotV1;
}

export interface NativeProjectSnapshotV2 extends Omit<
  NativeProjectSnapshotV1,
  "transportSettings"
> {
  readonly transportSettings: NativeTransportStateV2;
}

export interface NativeProjectFileV2 {
  readonly format: typeof NATIVE_PROJECT_FILE_FORMAT;
  readonly formatVersion: typeof PREVIOUS_NATIVE_PROJECT_FILE_VERSION;
  readonly metadata: NativeProjectFileMetadata;
  readonly project: NativeProjectSnapshotV2;
}

export interface NativeProjectSnapshotV3 extends NativeProjectSnapshotV2 {
  readonly masterBus: NativeMasterBusV3ToV4;
}

export interface NativeProjectFileV3 {
  readonly format: typeof NATIVE_PROJECT_FILE_FORMAT;
  readonly formatVersion: typeof MASTER_BUS_NATIVE_PROJECT_FILE_VERSION;
  readonly metadata: NativeProjectFileMetadata;
  readonly project: NativeProjectSnapshotV3;
}

export interface NativeProjectSnapshotV4 extends Omit<
  NativeProjectSnapshotV3,
  "voicesById"
> {
  readonly voicesById: Readonly<Record<VoiceId, Voice>>;
}

export interface NativeProjectFileV4 {
  readonly format: typeof NATIVE_PROJECT_FILE_FORMAT;
  readonly formatVersion: typeof POLYPHONY_NATIVE_PROJECT_FILE_VERSION;
  readonly metadata: NativeProjectFileMetadata;
  readonly project: NativeProjectSnapshotV4;
}

export interface NativeProjectSnapshotV5 extends Omit<
  NativeProjectSnapshotV4,
  "masterBus"
> {
  readonly masterBus: MasterBusState;
}

export interface NativeProjectFileV5 {
  readonly format: typeof NATIVE_PROJECT_FILE_FORMAT;
  readonly formatVersion: typeof NATIVE_PROJECT_FILE_VERSION;
  readonly metadata: NativeProjectFileMetadata;
  readonly project: NativeProjectSnapshotV5;
}

export interface LoadedNativeProject {
  readonly metadata: NativeProjectFileMetadata;
  readonly projectState: ProjectState;
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
): string {
  const document: NativeProjectFileV5 = {
    format: NATIVE_PROJECT_FILE_FORMAT,
    formatVersion: NATIVE_PROJECT_FILE_VERSION,
    metadata,
    project: {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      title: state.title,
      measureCount: state.measureCount,
      voicesById: state.voicesById,
      voiceOrder: state.voiceOrder,
      tracksByVoiceId: state.tracksByVoiceId,
      masterBus: state.masterBus,
      transportSettings: {
        ...state.transportSettings,
        anchorAudioTimeSeconds: null,
      },
    },
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
      "The selected file is not a native Piano Roll project.",
    );
  }

  const formatVersion = readSafeInteger(
    document["formatVersion"],
    "$.formatVersion",
  );

  if (
    formatVersion !== LEGACY_NATIVE_PROJECT_FILE_VERSION
    && formatVersion !== PREVIOUS_NATIVE_PROJECT_FILE_VERSION
    && formatVersion !== MASTER_BUS_NATIVE_PROJECT_FILE_VERSION
    && formatVersion !== POLYPHONY_NATIVE_PROJECT_FILE_VERSION
    && formatVersion !== NATIVE_PROJECT_FILE_VERSION
  ) {
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
    formatVersion,
  );

  return {
    metadata,
    projectState,
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
    `${baseName.length > 0 ? baseName : "untitled-project"}`
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

function parseProjectSnapshot(
  source: unknown,
  path: string,
  formatVersion: number,
): ProjectState {
  const project = readRecord(source, path);
  const schemaVersion = readSafeInteger(
    project["schemaVersion"],
    `${path}.schemaVersion`,
  );

  const expectedSchemaVersion =
    formatVersion === LEGACY_NATIVE_PROJECT_FILE_VERSION
      ? LEGACY_PROJECT_SCHEMA_VERSION
      : formatVersion === PREVIOUS_NATIVE_PROJECT_FILE_VERSION
        ? PREVIOUS_PROJECT_SCHEMA_VERSION
        : formatVersion === MASTER_BUS_NATIVE_PROJECT_FILE_VERSION
          ? MASTER_BUS_PROJECT_SCHEMA_VERSION
          : formatVersion === POLYPHONY_NATIVE_PROJECT_FILE_VERSION
            ? POLYPHONY_PROJECT_SCHEMA_VERSION
            : PROJECT_SCHEMA_VERSION;

  if (schemaVersion !== expectedSchemaVersion) {
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
  const measureCount = readIntegerInRange(
    project["measureCount"],
    `${path}.measureCount`,
    MINIMUM_MEASURE_COUNT,
    MAXIMUM_MEASURE_COUNT,
  );
  const voiceOrder = parseVoiceOrder(
    project["voiceOrder"],
    `${path}.voiceOrder`,
  );
  const voicesById = parseVoices(
    project["voicesById"],
    voiceOrder,
    `${path}.voicesById`,
    formatVersion,
  );
  const transportSettings = parseTransport(
    project["transportSettings"],
    `${path}.transportSettings`,
    formatVersion,
  );
  const masterBus =
    formatVersion >= MASTER_BUS_NATIVE_PROJECT_FILE_VERSION
      ? parseMasterBus(
          project["masterBus"],
          `${path}.masterBus`,
          formatVersion,
        )
      : createDefaultMasterBusState();
  const partialState: ProjectState = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    revision: 0,
    title,
    measureCount,
    voicesById,
    voiceOrder,
    tracksByVoiceId: {},
    transportSettings,
    masterBus,
  };
  const durationValidation = validateProjectDuration(
    measureCount,
    transportSettings,
  );

  if (!durationValidation.valid) {
    fail(
      "INVALID_DATA",
      `${path}.measureCount`,
      durationValidation.issues[0]?.message
        ?? "Project duration is invalid.",
    );
  }

  const tracksByVoiceId = parseTracks(
    project["tracksByVoiceId"],
    voiceOrder,
    partialState,
    `${path}.tracksByVoiceId`,
  );
  const projectState: ProjectState = {
    ...partialState,
    tracksByVoiceId,
  };

  assertTransportWithinProject(projectState, path);
  return projectState;
}

function parseVoiceOrder(
  source: unknown,
  path: string,
): readonly VoiceId[] {
  const values = readArray(source, path);

  if (values.length > MAXIMUM_VOICE_COUNT) {
    fail(
      "INVALID_DATA",
      path,
      `A project cannot contain more than ${MAXIMUM_VOICE_COUNT} voices.`,
    );
  }

  const voiceOrder: VoiceId[] = [];
  const uniqueVoiceIds = new Set<VoiceId>();

  for (
    let voiceIndex = 0;
    voiceIndex < values.length;
    voiceIndex += 1
  ) {
    const voiceId = readNonEmptyString(
      values[voiceIndex],
      `${path}[${voiceIndex}]`,
      MAXIMUM_ID_LENGTH,
    );

    if (uniqueVoiceIds.has(voiceId)) {
      fail(
        "INVALID_DATA",
        `${path}[${voiceIndex}]`,
        `Voice ID "${voiceId}" appears more than once.`,
      );
    }

    uniqueVoiceIds.add(voiceId);
    voiceOrder.push(voiceId);
  }

  return voiceOrder;
}

function parseVoices(
  source: unknown,
  voiceOrder: readonly VoiceId[],
  path: string,
  formatVersion: number,
): Readonly<Record<VoiceId, Voice>> {
  const sourceVoices = readRecord(source, path);
  assertExactRecordKeys(sourceVoices, voiceOrder, path);
  const voicesById =
    Object.create(null) as Record<VoiceId, Voice>;

  for (
    let voiceIndex = 0;
    voiceIndex < voiceOrder.length;
    voiceIndex += 1
  ) {
    const voiceId = voiceOrder[voiceIndex];

    if (voiceId !== undefined) {
      voicesById[voiceId] = parseVoice(
        sourceVoices[voiceId],
        voiceId,
        `${path}.${voiceId}`,
        formatVersion,
      );
    }
  }

  return voicesById;
}

function parseVoice(
  source: unknown,
  expectedVoiceId: VoiceId,
  path: string,
  formatVersion: number,
): Voice {
  const voice = readRecord(source, path);
  const id = readNonEmptyString(
    voice["id"],
    `${path}.id`,
    MAXIMUM_ID_LENGTH,
  );

  if (id !== expectedVoiceId) {
    fail(
      "INVALID_DATA",
      `${path}.id`,
      `Voice ID "${id}" must match its record key "${expectedVoiceId}".`,
    );
  }

  const color = readString(
    voice["color"],
    `${path}.color`,
    32,
  );

  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    fail(
      "INVALID_DATA",
      `${path}.color`,
      "Voice color must use the #RRGGBB format.",
    );
  }

  const parsedVoice: Voice = {
    id,
    name: readNonEmptyString(
      voice["name"],
      `${path}.name`,
      MAXIMUM_NAME_LENGTH,
    ),
    color,
    muted: readBoolean(voice["muted"], `${path}.muted`),
    locked: readBoolean(voice["locked"], `${path}.locked`),
    solo: readBoolean(voice["solo"], `${path}.solo`),
    gain: readFiniteNumber(voice["gain"], `${path}.gain`),
    pan: readNumberInRange(
      voice["pan"],
      `${path}.pan`,
      -1,
      1,
    ),
    instrument: parseInstrument(
      voice["instrument"],
      `${path}.instrument`,
      formatVersion,
    ),
    effects: parseEffects(voice["effects"], `${path}.effects`),
    generativeRules: parseGenerativeRules(
      voice["generativeRules"],
      `${path}.generativeRules`,
    ),
    interpretation: parseVoiceInterpretation(
      voice["interpretation"],
      `${path}.interpretation`,
    ),
  };
  const validation = validateVoice(parsedVoice);

  if (!validation.valid) {
    const issue = validation.issues[0];

    fail(
      "INVALID_DATA",
      issue === undefined ? path : `${path}.${issue.path}`,
      issue?.message ?? "Voice configuration is invalid.",
    );
  }

  return parsedVoice;
}

function parseInstrument(
  source: unknown,
  path: string,
  formatVersion: number,
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

  return parseSubtractiveSynth(instrument, path, formatVersion);
}

function parseSubtractiveSynth(
  instrument: UnknownRecord,
  path: string,
  formatVersion: number,
): SubtractiveSynthConfig {
  return {
    kind: "subtractive",
    oscillatorWaveform: parseWaveform(
      instrument["oscillatorWaveform"],
      `${path}.oscillatorWaveform`,
    ),
    polyphony:
      formatVersion >= POLYPHONY_NATIVE_PROJECT_FILE_VERSION
        ? readIntegerInRange(
            instrument["polyphony"],
            `${path}.polyphony`,
            MINIMUM_INSTRUMENT_POLYPHONY,
            MAXIMUM_INSTRUMENT_POLYPHONY,
          )
        : DEFAULT_INSTRUMENT_POLYPHONY,
    oscillatorDetuneCents: readFiniteNumber(
      instrument["oscillatorDetuneCents"],
      `${path}.oscillatorDetuneCents`,
    ),
    envelope: parseEnvelope(
      instrument["envelope"],
      `${path}.envelope`,
    ),
    filterCutoffHz: readPositiveNumber(
      instrument["filterCutoffHz"],
      `${path}.filterCutoffHz`,
    ),
    filterResonance: readNonNegativeNumber(
      instrument["filterResonance"],
      `${path}.filterResonance`,
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

function parseVoiceInterpretation(
  source: unknown,
  path: string,
): VoiceInterpretation {
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
  formatVersion: number,
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
  const loopSource = transport["loop"];
  let loop: LoopRegion;
  let loopEnabled: boolean;

  if (formatVersion === LEGACY_NATIVE_PROJECT_FILE_VERSION) {
    loopEnabled = loopSource !== null;

    if (loopSource === null) {
      const endTick = (
        ppqn * 4 * numerator / denominator
      );

      if (!Number.isSafeInteger(endTick) || endTick <= 0) {
        fail(
          "INVALID_DATA",
          `${path}.loop`,
          "The default loop region cannot be represented in ticks.",
        );
      }

      loop = {
        startTick: 0,
        endTick,
      };
    } else {
      loop = parseLoop(loopSource, `${path}.loop`);
    }
  } else {
    loop = parseLoop(loopSource, `${path}.loop`);
    loopEnabled = readBoolean(
      transport["loopEnabled"],
      `${path}.loopEnabled`,
    );
  }

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
  formatVersion: number,
): MasterBusState {
  const masterBus = readRecord(source, path);

  return {
    gain: readNumberInRange(
      masterBus["gain"],
      `${path}.gain`,
      MINIMUM_MASTER_GAIN,
      MAXIMUM_MASTER_GAIN,
    ),
    muted:
      formatVersion >= NATIVE_PROJECT_FILE_VERSION
        ? readBoolean(masterBus["muted"], `${path}.muted`)
        : false,
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
  voiceOrder: readonly VoiceId[],
  partialState: ProjectState,
  path: string,
): Readonly<Record<VoiceId, Track>> {
  const sourceTracks = readRecord(source, path);

  assertExactRecordKeys(sourceTracks, voiceOrder, path);
  const tracksByVoiceId =
    Object.create(null) as Record<VoiceId, Track>;
  const globalNoteIds = new Set<NoteId>();
  let totalNoteCount = 0;

  for (
    let voiceIndex = 0;
    voiceIndex < voiceOrder.length;
    voiceIndex += 1
  ) {
    const voiceId = voiceOrder[voiceIndex];

    if (voiceId === undefined) {
      continue;
    }

    const trackPath = `${path}.${voiceId}`;
    const track = readRecord(sourceTracks[voiceId], trackPath);
    const trackVoiceId = readNonEmptyString(
      track["voiceId"],
      `${trackPath}.voiceId`,
      MAXIMUM_ID_LENGTH,
    );

    if (trackVoiceId !== voiceId) {
      fail(
        "INVALID_DATA",
        `${trackPath}.voiceId`,
        `Track voice ID "${trackVoiceId}" must match "${voiceId}".`,
      );
    }

    const notesById = parseNotes(
      track["notesById"],
      voiceId,
      partialState,
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

    tracksByVoiceId[voiceId] = {
      voiceId,
      notesById,
    };
  }

  return tracksByVoiceId;
}

function parseNotes(
  source: unknown,
  voiceId: VoiceId,
  partialState: ProjectState,
  globalNoteIds: Set<NoteId>,
  trackPath: string,
): Readonly<Record<NoteId, Note>> {
  const sourceNotes = readRecord(
    source,
    `${trackPath}.notesById`,
  );
  const notesById =
    Object.create(null) as Record<NoteId, Note>;
  const projectDurationTicks =
    getProjectDurationTicks(partialState);

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
      voiceId: readNonEmptyString(
        noteRecord["voiceId"],
        `${notePath}.voiceId`,
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
        `Note ID "${note.id}" must be unique across the project.`,
      );
    }

    const validation = validateNoteForTrack(note, voiceId);

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
        `Note "${note.id}" exceeds the project duration.`,
      );
    }

    globalNoteIds.add(note.id);
    notesById[note.id] = note;
  }

  return notesById;
}

function assertTransportWithinProject(
  state: ProjectState,
  projectPath: string,
): void {
  const durationTicks = getProjectDurationTicks(state);
  const transport = state.transportSettings;

  if (transport.anchorTick > durationTicks) {
    fail(
      "INVALID_DATA",
      `${projectPath}.transportSettings.anchorTick`,
      "Transport anchor exceeds the project duration.",
    );
  }

  if (
    transport.loop.endTick > durationTicks
  ) {
    fail(
      "INVALID_DATA",
      `${projectPath}.transportSettings.loop`,
      "Loop region exceeds the project duration.",
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
      "Record keys must exactly match the voice order.",
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
