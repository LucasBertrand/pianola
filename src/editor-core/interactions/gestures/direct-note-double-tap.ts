import type {
  NoteId,
} from "../../../domain/identifiers";
import type {
  PointerSample,
} from "../pointer/pointer-sample";

export interface DirectNoteDoubleTapSettings {
  readonly maximumDelayMs: number;
  readonly maximumDistanceCssPixels: number;
}

/** Recognizes two consecutive touch or pen taps on the same note. */
export class DirectNoteDoubleTapGesture {
  private previousNoteId: NoteId | null = null;
  private previousTapTimeStamp = 0;
  private previousTapX = 0;
  private previousTapY = 0;

  public constructor(
    private readonly settings: DirectNoteDoubleTapSettings,
  ) {}

  public recordTap(
    event: Pick<
      PointerSample,
      "pointerType" | "timeStamp" | "clientX" | "clientY"
    >,
    noteId: NoteId,
  ): boolean {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") {
      return false;
    }

    const elapsed = event.timeStamp - this.previousTapTimeStamp;
    const deltaX = event.clientX - this.previousTapX;
    const deltaY = event.clientY - this.previousTapY;
    const maximumDistanceSquared =
      this.settings.maximumDistanceCssPixels ** 2;
    const isDoubleTap =
      this.previousNoteId === noteId
      && elapsed > 0
      && elapsed <= this.settings.maximumDelayMs
      && deltaX * deltaX + deltaY * deltaY <= maximumDistanceSquared;

    if (isDoubleTap) {
      this.reset();
      return true;
    }

    this.previousNoteId = noteId;
    this.previousTapTimeStamp = event.timeStamp;
    this.previousTapX = event.clientX;
    this.previousTapY = event.clientY;
    return false;
  }

  public reset(): void {
    this.previousNoteId = null;
    this.previousTapTimeStamp = 0;
    this.previousTapX = 0;
    this.previousTapY = 0;
  }
}
