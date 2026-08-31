import { test, expect } from "vitest";
import { PianoRollGestureStateMachine } from "../gesture-state-machine";
import type { InteractionDraft } from "../gesture-draft";

function createEmptyDraft(): InteractionDraft {
  return {
    mode: "IDLE",
    pointerId: -1,
    overlayLeft: 0,
    overlayTop: 0,
    originLocalX: 0,
    originLocalY: 0,
    currentLocalX: 0,
    currentLocalY: 0,
    originPointerTick: 0,
    originPointerPitch: 0,
    targetNoteId: null,
    snapResolutionTicks: 100,
    snapAbsoluteTick: (tick) => tick,
    getSnapSettingsAtTick: () => ({ enabled: false, visualGuideEnabled: false, rootNote: "C", patternType: "scale", patternId: "major" }),
    selectionMode: "replace",
    deltaTicks: 0,
    deltaPitch: 0,
    minimumResizeDeltaTicks: Number.NEGATIVE_INFINITY,
    maximumResizeDeltaTicks: Number.POSITIVE_INFINITY,
    minimumSelectedStartTick: 0,
    maximumSelectedEndTick: 0,
    minimumSelectedPitch: 0,
    maximumSelectedPitch: 127,
    originResizeTick: 0,
    drawStartTick: 0,
    drawPitch: 0,
    drawDurationTicks: 0,
    drawInstrumentId: null,
  };
}

test("drag resets origin when constrained so that reversing direction immediately applies", () => {
  const machine = new PianoRollGestureStateMachine(createEmptyDraft());

  machine.beginPointer({
    pointerId: 1,
    overlayLeft: 0,
    overlayTop: 0,
    localX: 0,
    localY: 0,
    pointerTick: 10, // Start pointer tick
    pointerPitch: 60,
    targetNoteId: null,
    snapResolutionTicks: 1,
    snapAbsoluteTick: (tick) => tick,
    getSnapSettingsAtTick: () => ({ enabled: false, visualGuideEnabled: false, rootNote: "C", patternType: "scale", patternId: "major" }),
    selectionMode: "replace",
  });

  machine.beginDrag({
    minimumStartTick: 0,
    maximumEndTick: 100,
    minimumPitch: 0,
    maximumPitch: 127,
  });

  // Drag left by 20. Target delta is -20. But minimum start tick is 0.
  // Constrained to 0 delta.
  machine.updatePointer(1, 0, 0, -10, 60, 1000, 0);

  expect(machine.draft.deltaTicks).toBe(0); // Clamped
  
  // Now move right by 5. New pointer tick is -5.
  // Since origin was adjusted, this rightward movement should immediately apply.
  machine.updatePointer(1, 0, 0, -5, 60, 1000, 0);

  expect(machine.draft.deltaTicks).toBe(5);
});

test("resize resets origin when constrained so that reversing direction immediately applies", () => {
  const machine = new PianoRollGestureStateMachine(createEmptyDraft());

  machine.beginPointer({
    pointerId: 1,
    overlayLeft: 0,
    overlayTop: 0,
    localX: 0,
    localY: 0,
    pointerTick: 100, // Start pointer tick
    pointerPitch: 60,
    targetNoteId: null,
    snapResolutionTicks: 1,
    snapAbsoluteTick: (tick) => tick,
    getSnapSettingsAtTick: () => ({ enabled: false, visualGuideEnabled: false, rootNote: "C", patternType: "scale", patternId: "major" }),
    selectionMode: "replace",
  });

  machine.beginResize(
    "start",
    100, // originResizeTick
    {
      minimumStartTick: 100,
      maximumEndTick: 200,
      minimumPitch: 0,
      maximumPitch: 127,
    },
    {
      minimumDeltaTicks: -100, // Can move 100 left
      maximumDeltaTicks: 50,   // Can move 50 right
    },
  );

  // Resize left by 200. Target delta is -200. Minimum delta is -100.
  // Constrained to -100.
  machine.updatePointer(1, 0, 0, -100, 60, 1000, 0);

  expect(machine.draft.deltaTicks).toBe(-100);
  
  // Now move right by 10. New pointer tick is -90.
  // Should immediately apply as +10 from the clamped boundary.
  machine.updatePointer(1, 0, 0, -90, 60, 1000, 0);

  expect(machine.draft.deltaTicks).toBe(-90);
});
