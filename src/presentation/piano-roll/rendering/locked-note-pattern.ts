import {
  APPLICATION_COLORS,
} from "../../styles/application-colors";

const lockedNotePatterns =
  new WeakMap<CanvasRenderingContext2D, CanvasPattern>();

export function getLockedNotePattern(
  context: CanvasRenderingContext2D,
): CanvasPattern | null {
  const cachedPattern = lockedNotePatterns.get(context);

  if (cachedPattern !== undefined) {
    return cachedPattern;
  }

  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = 8;
  patternCanvas.height = 8;
  const patternContext = patternCanvas.getContext("2d");

  if (patternContext === null) {
    return null;
  }

  patternContext.clearRect(0, 0, 8, 8);
  patternContext.strokeStyle =
    APPLICATION_COLORS.pianoRoll.lockedNoteHatch;
  patternContext.lineWidth = 2;
  patternContext.beginPath();
  patternContext.moveTo(-2, 8);
  patternContext.lineTo(8, -2);
  patternContext.moveTo(4, 10);
  patternContext.lineTo(10, 4);
  patternContext.stroke();

  const pattern = context.createPattern(patternCanvas, "repeat");

  if (pattern !== null) {
    lockedNotePatterns.set(context, pattern);
  }

  return pattern;
}
