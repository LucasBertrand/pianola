import { describe, expect, test } from "vitest";
import {
  type Note,
} from "../notes/note";
import {
  createTargetedNoteTransformationPlan,
} from "../targeted-note-transformations";

const SOURCE_NOTES: readonly Note[] = [{
  id: "source-note",
  instrumentId: "instrument-a",
  pitch: 60,
  startTick: 120,
  durationTicks: 240,
  velocity: 100,
  enabled: true,
}];

describe("targeted note transformations", () => {
  test.each(["clip", "pattern"] as const)(
    "keeps the %s source identity in a pure plan",
    (sourceKind) => {
      const plan = createTargetedNoteTransformationPlan(
        {
          sourceKind,
          sourceId: `${sourceKind}-a`,
          durationTicks: 1_920,
        },
        SOURCE_NOTES,
        "augment",
      );

      expect(plan.target).toEqual({
        sourceKind,
        sourceId: `${sourceKind}-a`,
        durationTicks: 1_920,
      });
      expect(plan.notes[0]?.durationTicks).toBe(480);
      expect(SOURCE_NOTES[0]?.durationTicks).toBe(240);
      expect(plan.notes[0]).not.toBe(SOURCE_NOTES[0]);
    },
  );
});
