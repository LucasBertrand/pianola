import {
  readdir,
} from "node:fs/promises";
import path from "node:path";
import {
  pathToFileURL,
} from "node:url";

const assetsDirectory = path.resolve("dist", "assets");
const protocolVersion = 1;
const workletAssetName = (await readdir(assetsDirectory)).find((fileName) => (
  fileName.startsWith("playback-processor-")
  && fileName.endsWith(".js")
));

if (workletAssetName === undefined) {
  throw new Error("The production audio worklet asset was not emitted.");
}

let Processor = null;
let registeredName = "";

globalThis.sampleRate = 48_000;
globalThis.currentFrame = 0;
globalThis.AudioWorkletProcessor = class {
  constructor() {
    const messages = [];

    this.port = {
      messages,
      onmessage: null,
      postMessage(message) {
        messages.push(message);
      },
    };
  }
};
globalThis.registerProcessor = (name, constructor) => {
  registeredName = name;
  Processor = constructor;
};

await import(pathToFileURL(
  path.join(assetsDirectory, workletAssetName),
).href);

if (registeredName !== "playback-processor" || Processor === null) {
  throw new Error("The production audio processor did not register.");
}

const processor = new Processor();
const instrument = {
  kind: "subtractive",
  oscillatorWaveform: "sine",
  polyphony: 1,
  oscillatorDetuneCents: 0,
  oscillatorFreePhase: false,
  pulseWidth: 0.5,
  envelope: {
    attackSeconds: 0.003,
    decaySeconds: 0,
    sustainLevel: 1,
    releaseSeconds: 0.01,
    curve: 0,
  },
  filterCutoffHz: 8_000,
  filterResonance: 0.2,
  filterKeyTracking: 0,
  filterEnvelopeAmountOctaves: 0,
  filterEnvelope: {
    attackSeconds: 0.003,
    decaySeconds: 0,
    sustainLevel: 1,
    releaseSeconds: 0.01,
    curve: 0,
  },
};

processor.port.onmessage({
  data: {
    protocolVersion,
    type: "load-timeline",
    sequence: 1,
    stateVersion: 1,
    timeline: {
      sourceId: "smoke-clip",
      ppqn: 960,
      durationTicks: 3_840,
      masterGain: 0.72,
      masterMuted: false,
      masterTuningFrequencyHz: 440,
      tempoStartTicks: new Float64Array([0]),
      tempoBpms: new Float64Array([120]),
      instruments: [{
        instrumentId: "smoke",
        noteIds: ["smoke-note"],
        pitches: new Uint8Array([69]),
        startTicks: new Float64Array([0]),
        durationTicks: new Float64Array([960]),
        maximumEndTickTree: new Float64Array([
          Number.NEGATIVE_INFINITY,
          960,
        ]),
        endTickTreeLeafCount: 1,
        gain: 0.82,
        pan: 0,
        muted: false,
        solo: false,
        instrument,
      }],
    },
    transport: {
      anchorTick: 0,
      loopEnabled: false,
      loop: { startTick: 0, endTick: 3_840 },
    },
  },
});
processor.port.onmessage({
  data: { protocolVersion, type: "play", tick: 0 },
});

const left = new Float32Array(128);
const right = new Float32Array(128);

if (!processor.process([], [[left, right]], {})) {
  throw new Error("The production audio processor stopped during smoke test.");
}

if (
  !left.some((sample) => sample !== 0)
  || left.some((sample) => !Number.isFinite(sample))
) {
  throw new Error("The production audio processor emitted invalid samples.");
}

if (!processor.port.messages.some((message) => (
  message.type === "transport-state"
  && message.status === "playing"
))) {
  throw new Error("The production worklet did not publish its transport state.");
}

if (processor.port.messages.some((message) => (
  message.protocolVersion !== protocolVersion
))) {
  throw new Error("The production worklet published an unversioned message.");
}

console.log("Production AudioWorklet smoke test passed (128 stereo frames).\n");
