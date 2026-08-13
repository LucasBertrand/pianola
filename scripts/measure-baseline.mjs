import {
  readFile,
  readdir,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {
  gzipSync,
} from "node:zlib";
import {
  createServer,
} from "vite";

const LARGE_FIXTURE_NOTE_COUNT = 20_000;
const PARSE_SAMPLE_COUNT = 7;
const HISTORY_ENTRY_COUNT = 200;
const vite = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "error",
  optimizeDeps: {
    noDiscovery: true,
  },
  root: process.cwd(),
  server: {
    middlewareMode: true,
  },
});

try {
  const {
    createDemoProjectState,
  } = await vite.ssrLoadModule("/src/app/demo-project.ts");
  const {
    serializeNativeProjectFile,
    parseNativeProjectFile,
  } = await vite.ssrLoadModule(
    "/src/project-io/native/native-project-file.ts",
  );
  const {
    ProjectStore,
  } = await vite.ssrLoadModule("/src/domain/project-store.ts");
  const {
    DEFAULT_PITCH_SNAP_SETTINGS,
  } = await vite.ssrLoadModule("/src/music/pitch-snap.ts");
  const {
    DEFAULT_GRID_SETTINGS,
  } = await vite.ssrLoadModule("/src/editor/model/grid-settings.ts");
  const project = createLargeProject(createDemoProjectState());
  const editorState = createEditorState(
    project,
    DEFAULT_PITCH_SNAP_SETTINGS,
    DEFAULT_GRID_SETTINGS,
  );
  const serializedProject = serializeNativeProjectFile(
    project,
    {
      documentId: "p0-baseline-large-fixture",
      createdAt: "2026-08-13T00:00:00.000Z",
      savedAt: "2026-08-13T00:00:00.000Z",
    },
    editorState,
  );

  parseNativeProjectFile(serializedProject);
  const parseDurationsMilliseconds = [];

  for (let sampleIndex = 0; sampleIndex < PARSE_SAMPLE_COUNT; sampleIndex += 1) {
    const startedAtMilliseconds = performance.now();

    parseNativeProjectFile(serializedProject);
    parseDurationsMilliseconds.push(
      performance.now() - startedAtMilliseconds,
    );
  }

  const historyMemory = measureHistoryMemory(ProjectStore, project);
  const bundleFiles = await collectBundleFiles(path.resolve("dist"));
  const cpus = os.cpus();

  console.log(JSON.stringify({
    capturedAt: new Date().toISOString(),
    environment: {
      platform: `${os.platform()} ${os.release()} ${os.arch()}`,
      cpu: cpus[0]?.model ?? "unknown",
      logicalCpuCount: cpus.length,
      totalMemoryBytes: os.totalmem(),
      node: process.version,
    },
    scene: {
      name: "large-native-project",
      noteCount: LARGE_FIXTURE_NOTE_COUNT,
      clipCount: project.clipOrder.length,
      instrumentCount: project.instrumentOrder.length,
      serializedBytes: Buffer.byteLength(serializedProject),
    },
    nativeProjectOpen: {
      samples: PARSE_SAMPLE_COUNT,
      medianMilliseconds: round(
        median(parseDurationsMilliseconds),
        3,
      ),
      maximumMilliseconds: round(
        Math.max(...parseDurationsMilliseconds),
        3,
      ),
    },
    history: historyMemory,
    bundles: bundleFiles,
  }, null, 2));
} finally {
  await vite.close();
}

function createLargeProject(project) {
  const instrumentId = project.instrumentOrder[0];
  const activeClip = project.clipsById[project.activeClipId];

  if (instrumentId === undefined || activeClip === undefined) {
    throw new Error("The demo project must contain an active clip and instrument.");
  }

  const notesById = {};
  let maximumEndTick = 0;

  for (let noteIndex = 0; noteIndex < LARGE_FIXTURE_NOTE_COUNT; noteIndex += 1) {
    const pitch = noteIndex % 128;
    const startTick = Math.floor(noteIndex / 128) * 120;
    const durationTicks = 60;
    const id = `baseline-note-${noteIndex}`;

    notesById[id] = {
      id,
      instrumentId,
      pitch,
      startTick,
      durationTicks,
      velocity: 100,
      enabled: true,
    };
    maximumEndTick = Math.max(maximumEndTick, startTick + durationTicks);
  }

  const ticksPerMeasure = (
    activeClip.transportSettings.ppqn
    * 4
    * activeClip.transportSettings.timeSignature.numerator
    / activeClip.transportSettings.timeSignature.denominator
  );
  const measureCount = Math.max(
    activeClip.measureCount,
    Math.ceil(maximumEndTick / ticksPerMeasure),
  );
  const tracksByInstrumentId = Object.fromEntries(
    project.instrumentOrder.map((currentInstrumentId) => {
      const track = activeClip.tracksByInstrumentId[currentInstrumentId];

      if (track === undefined) {
        throw new Error(`Missing track for ${currentInstrumentId}.`);
      }

      return [
        currentInstrumentId,
        {
          ...track,
          notesById: currentInstrumentId === instrumentId ? notesById : {},
        },
      ];
    }),
  );

  return {
    ...project,
    title: "P0 large fixture",
    clipsById: {
      ...project.clipsById,
      [activeClip.id]: {
        ...activeClip,
        measureCount,
        tracksByInstrumentId,
      },
    },
  };
}

function createEditorState(project, pitchSnapSettings, gridSettings) {
  return {
    selectedInstrumentId: project.instrumentOrder[0] ?? null,
    selectionMode: "replace",
    noteColorMode: "pitch",
    pitchPreviewEnabled: false,
    clipStatesById: Object.fromEntries(
      project.clipOrder.map((clipId) => [
        clipId,
        {
          playheadTick: 0,
          pitchSnapSettings,
          gridSettings,
          viewport: {
            zoomX: 1,
            zoomY: 1,
            scrollX: 0,
            scrollY: 0,
          },
        },
      ]),
    ),
  };
}

function measureHistoryMemory(ProjectStore, project) {
  globalThis.gc?.();
  const store = new ProjectStore(project);
  const beforeBytes = process.memoryUsage().heapUsed;

  for (let sequence = 1; sequence <= HISTORY_ENTRY_COUNT; sequence += 1) {
    store.dispatch({
      transactionId: `baseline-history-${sequence}`,
      label: "Baseline history edit",
      createdAt: sequence,
      commands: [{
        type: "UpdateProjectTitle",
        title: `P0 large fixture ${sequence}`,
      }],
    });
  }

  globalThis.gc?.();
  const afterBytes = process.memoryUsage().heapUsed;

  return {
    entries: HISTORY_ENTRY_COUNT,
    retainedHeapBytes: Math.max(0, afterBytes - beforeBytes),
    canUndo: store.canUndo(),
  };
}

async function collectBundleFiles(directory) {
  const entries = await readdir(directory, {
    withFileTypes: true,
  });
  const bundles = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      bundles.push(...await collectBundleFiles(entryPath));
      continue;
    }

    if (!/\.(css|js)$/.test(entry.name)) {
      continue;
    }

    const contents = await readFile(entryPath);
    const fileStats = await stat(entryPath);

    bundles.push({
      file: path.relative(path.resolve("dist"), entryPath)
        .split(path.sep)
        .join("/"),
      bytes: fileStats.size,
      gzipBytes: gzipSync(contents).byteLength,
    });
  }

  return bundles.sort((left, right) => left.file.localeCompare(right.file));
}

function median(values) {
  const sortedValues = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sortedValues.length / 2);

  return sortedValues[middleIndex] ?? 0;
}

function round(value, decimalCount) {
  const multiplier = 10 ** decimalCount;

  return Math.round(value * multiplier) / multiplier;
}
