import type {
  Note,
  VoiceId,
} from "../domain/model";
import type {
  CoordinateConverter,
} from "../geometry/converter";
import type {
  SpatialIndex,
  SpatialTouchEnvelope,
} from "../geometry/spatial-index";
import type {
  PointerKind,
} from "./core/input";
import type {
  ResizeEdge,
} from "./core/state";

export function createTouchEnvelope(
  converter: CoordinateConverter,
  pointerType: PointerKind,
  mouseRadiusCssPixels: number,
  touchRadiusCssPixels: number,
): SpatialTouchEnvelope {
  const radiusCssPixels =
    pointerType === "touch"
      ? touchRadiusCssPixels
      : mouseRadiusCssPixels;
  const tickRadius = Math.abs(
    converter.cssPixelXToTick(radiusCssPixels)
      - converter.cssPixelXToTick(0),
  );

  return {
    tickRadius,
    pitchRadius: 0,
  };
}

export function hasVoiceCollision(
  voiceId: VoiceId,
  startTick: number,
  endTick: number,
  pitch: number,
  spatialIndex: SpatialIndex,
  collisionBuffer: Note[],
): boolean {
  spatialIndex.queryRect(
    startTick,
    endTick,
    pitch,
    pitch,
    collisionBuffer,
  );

  for (
    let noteIndex = 0;
    noteIndex < collisionBuffer.length;
    noteIndex += 1
  ) {
    if (collisionBuffer[noteIndex]?.voiceId === voiceId) {
      return true;
    }
  }

  return false;
}

export function hasResizeCollision(
  notes: readonly Note[],
  deltaTicks: number,
  edge: ResizeEdge,
  spatialIndex: SpatialIndex,
  collisionBuffer: Note[],
): boolean {
  for (
    let noteIndex = 0;
    noteIndex < notes.length;
    noteIndex += 1
  ) {
    const note = notes[noteIndex];

    if (note === undefined) {
      continue;
    }

    const startTick =
      edge === "start"
        ? note.startTick + deltaTicks
        : note.startTick;
    const durationTicks =
      edge === "start"
        ? note.durationTicks - deltaTicks
        : note.durationTicks + deltaTicks;

    spatialIndex.queryRect(
      startTick,
      startTick + durationTicks,
      note.pitch,
      note.pitch,
      collisionBuffer,
    );

    for (
      let candidateIndex = 0;
      candidateIndex < collisionBuffer.length;
      candidateIndex += 1
    ) {
      const candidate = collisionBuffer[candidateIndex];

      if (
        candidate !== undefined
        && candidate.voiceId === note.voiceId
        && candidate.id !== note.id
      ) {
        return true;
      }
    }
  }

  return false;
}
