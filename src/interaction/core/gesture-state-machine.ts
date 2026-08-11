import type {
  NoteId,
  InstrumentId,
} from "../../domain/model";
import type {
  PitchSnapSettings,
} from "../../music/pitch-snap";
import {
  quantizeTick,
  type NoteSelectionBounds,
  type ResizeDeltaBounds,
} from "./note-gesture-math";
import type {
  InteractionDraft,
  InteractionMode,
  ResizeEdge,
  SelectionMode,
} from "./state";

export type GestureUpdateKind =
  | "none"
  | "beginLasso"
  | "updateLasso"
  | "updateDrag"
  | "updateResize"
  | "updateDraw";

export interface PointerGestureStart {
  readonly pointerId: number;
  readonly overlayLeft: number;
  readonly overlayTop: number;
  readonly localX: number;
  readonly localY: number;
  readonly pointerTick: number;
  readonly pointerPitch: number;
  readonly targetNoteId: NoteId | null;
  readonly snapResolutionTicks: number;
  readonly pitchSnapSettings: PitchSnapSettings;
  readonly selectionMode: SelectionMode;
}

export interface GestureCompletion {
  readonly mode: Exclude<InteractionMode, "IDLE">;
  readonly pointerWasTap: boolean;
  readonly targetNoteId: NoteId | null;
  readonly deltaTicks: number;
  readonly deltaPitch: number;
  readonly pitchSnapSettings: PitchSnapSettings;
  readonly drawStartTick: number;
  readonly drawPitch: number;
  readonly drawDurationTicks: number;
  readonly drawInstrumentId: InstrumentId | null;
  readonly originLocalX: number;
  readonly originLocalY: number;
  readonly currentLocalX: number;
  readonly currentLocalY: number;
  readonly snapResolutionTicks: number;
  readonly selectionMode: SelectionMode;
}

/**
 * Owns legal gesture transitions and high-frequency draft calculations.
 * Rendering and command dispatch deliberately remain outside this class.
 */
export class PianoRollGestureStateMachine {
  private pointerPrepared = false;

  public constructor(
    public readonly draft: InteractionDraft,
  ) {}

  public beginPointer(start: PointerGestureStart): boolean {
    if (
      this.draft.mode !== "IDLE"
      || this.pointerPrepared
    ) {
      return false;
    }

    this.draft.pointerId = start.pointerId;
    this.draft.overlayLeft = start.overlayLeft;
    this.draft.overlayTop = start.overlayTop;
    this.draft.originLocalX = start.localX;
    this.draft.originLocalY = start.localY;
    this.draft.currentLocalX = start.localX;
    this.draft.currentLocalY = start.localY;
    this.draft.originPointerTick = start.pointerTick;
    this.draft.originPointerPitch = start.pointerPitch;
    this.draft.targetNoteId = start.targetNoteId;
    this.draft.snapResolutionTicks = start.snapResolutionTicks;
    this.draft.pitchSnapSettings = start.pitchSnapSettings;
    this.draft.selectionMode = start.selectionMode;
    this.draft.deltaTicks = 0;
    this.draft.deltaPitch = 0;
    this.pointerPrepared = true;
    return true;
  }

  public beginPendingLasso(): void {
    this.assertPointerPrepared();
    this.draft.mode = "PENDING_LASSO";
  }

  public beginPendingNoteSelection(): void {
    this.assertPointerPrepared();
    this.draft.mode = "PENDING_NOTE_SELECTION";
  }

  public beginDrag(bounds: NoteSelectionBounds): void {
    this.assertPointerPrepared();
    this.applySelectionBounds(bounds);
    this.draft.mode = "DRAGGING";
  }

  public beginResize(
    edge: ResizeEdge,
    originResizeTick: number,
    selectionBounds: NoteSelectionBounds,
    resizeBounds: ResizeDeltaBounds,
  ): void {
    this.assertPointerPrepared();
    this.applySelectionBounds(selectionBounds);
    this.draft.originResizeTick = originResizeTick;
    this.draft.minimumResizeDeltaTicks =
      resizeBounds.minimumDeltaTicks;
    this.draft.maximumResizeDeltaTicks =
      resizeBounds.maximumDeltaTicks;
    this.draft.mode =
      edge === "start" ? "RESIZING_START" : "RESIZING_END";
  }

  public beginDrawing(
    startTick: number,
    pitch: number,
    durationTicks: number,
    instrumentId: InstrumentId,
  ): void {
    this.assertPointerPrepared();
    this.draft.drawStartTick = startTick;
    this.draft.drawPitch = pitch;
    this.draft.drawDurationTicks = durationTicks;
    this.draft.drawInstrumentId = instrumentId;
    this.draft.mode = "DRAWING";
  }

  public updatePointer(
    pointerId: number,
    localX: number,
    localY: number,
    pointerTick: number,
    pointerPitch: number,
    totalTicks: number,
    movementToleranceCssPixels: number,
  ): GestureUpdateKind {
    if (!this.isPointerActive(pointerId)) {
      return "none";
    }

    this.draft.currentLocalX = localX;
    this.draft.currentLocalY = localY;

    if (this.draft.mode === "PENDING_LASSO") {
      if (!this.hasMovedBeyond(movementToleranceCssPixels)) {
        return "none";
      }

      this.draft.mode = "LASSO_SELECTING";
      return "beginLasso";
    }

    if (this.draft.mode === "DRAGGING") {
      return this.updateDrag(
        pointerTick,
        pointerPitch,
        totalTicks,
      );
    }

    if (
      this.draft.mode === "RESIZING_START"
      || this.draft.mode === "RESIZING_END"
    ) {
      return this.updateResize(pointerTick);
    }

    if (this.draft.mode === "DRAWING") {
      return this.updateDraw(pointerTick, totalTicks);
    }

    if (this.draft.mode === "LASSO_SELECTING") {
      return "updateLasso";
    }

    return "none";
  }

  public isPointerActive(pointerId: number): boolean {
    return (
      this.draft.mode !== "IDLE"
      && this.draft.pointerId === pointerId
    );
  }

  public isTap(movementToleranceCssPixels: number): boolean {
    return !this.hasMovedBeyond(movementToleranceCssPixels);
  }

  public completePointer(
    pointerId: number,
    movementToleranceCssPixels: number,
  ): GestureCompletion | null {
    if (!this.isPointerActive(pointerId)) {
      return null;
    }

    const mode = this.draft.mode;

    if (mode === "IDLE") {
      return null;
    }

    const completion: GestureCompletion = {
      mode,
      pointerWasTap: this.isTap(movementToleranceCssPixels),
      targetNoteId: this.draft.targetNoteId,
      deltaTicks: this.draft.deltaTicks,
      deltaPitch: this.draft.deltaPitch,
      pitchSnapSettings: this.draft.pitchSnapSettings,
      drawStartTick: this.draft.drawStartTick,
      drawPitch: this.draft.drawPitch,
      drawDurationTicks: this.draft.drawDurationTicks,
      drawInstrumentId: this.draft.drawInstrumentId,
      originLocalX: this.draft.originLocalX,
      originLocalY: this.draft.originLocalY,
      currentLocalX: this.draft.currentLocalX,
      currentLocalY: this.draft.currentLocalY,
      snapResolutionTicks: this.draft.snapResolutionTicks,
      selectionMode: this.draft.selectionMode,
    };

    this.reset();
    return completion;
  }

  public reset(): void {
    this.pointerPrepared = false;
    this.draft.mode = "IDLE";
    this.draft.pointerId = -1;
    this.draft.deltaTicks = 0;
    this.draft.deltaPitch = 0;
    this.draft.minimumResizeDeltaTicks = Number.NEGATIVE_INFINITY;
    this.draft.maximumResizeDeltaTicks = Number.POSITIVE_INFINITY;
    this.draft.maximumSelectedEndTick = 0;
    this.draft.originResizeTick = 0;
    this.draft.targetNoteId = null;
    this.draft.drawStartTick = 0;
    this.draft.drawPitch = 0;
    this.draft.drawDurationTicks = 0;
    this.draft.drawInstrumentId = null;
    this.draft.selectionMode = "replace";
  }

  private applySelectionBounds(bounds: NoteSelectionBounds): void {
    this.draft.minimumSelectedStartTick = bounds.minimumStartTick;
    this.draft.maximumSelectedEndTick = bounds.maximumEndTick;
    this.draft.minimumSelectedPitch = bounds.minimumPitch;
    this.draft.maximumSelectedPitch = bounds.maximumPitch;
  }

  private assertPointerPrepared(): void {
    if (!this.pointerPrepared || this.draft.mode !== "IDLE") {
      throw new Error("Cannot enter a gesture mode from the current state.");
    }
  }

  private hasMovedBeyond(toleranceCssPixels: number): boolean {
    return (
      Math.abs(
        this.draft.currentLocalX - this.draft.originLocalX,
      ) > toleranceCssPixels
      || Math.abs(
        this.draft.currentLocalY - this.draft.originLocalY,
      ) > toleranceCssPixels
    );
  }

  private updateDrag(
    pointerTick: number,
    pointerPitch: number,
    totalTicks: number,
  ): GestureUpdateKind {
    let deltaTicks = quantizeTick(
      pointerTick - this.draft.originPointerTick,
      this.draft.snapResolutionTicks,
    );
    let deltaPitch =
      pointerPitch - this.draft.originPointerPitch;

    if (this.draft.minimumSelectedStartTick + deltaTicks < 0) {
      deltaTicks = -this.draft.minimumSelectedStartTick;
    }

    if (this.draft.maximumSelectedEndTick + deltaTicks > totalTicks) {
      deltaTicks = totalTicks - this.draft.maximumSelectedEndTick;
    }

    if (this.draft.minimumSelectedPitch + deltaPitch < 0) {
      deltaPitch = -this.draft.minimumSelectedPitch;
    } else if (this.draft.maximumSelectedPitch + deltaPitch > 127) {
      deltaPitch = 127 - this.draft.maximumSelectedPitch;
    }

    if (
      deltaTicks === this.draft.deltaTicks
      && deltaPitch === this.draft.deltaPitch
    ) {
      return "none";
    }

    this.draft.deltaTicks = deltaTicks;
    this.draft.deltaPitch = deltaPitch;
    return "updateDrag";
  }

  private updateResize(pointerTick: number): GestureUpdateKind {
    const targetTick = quantizeTick(
      this.draft.originResizeTick
        + pointerTick
        - this.draft.originPointerTick,
      this.draft.snapResolutionTicks,
    );
    let deltaTicks = targetTick - this.draft.originResizeTick;

    if (deltaTicks < this.draft.minimumResizeDeltaTicks) {
      deltaTicks = this.draft.minimumResizeDeltaTicks;
    } else if (deltaTicks > this.draft.maximumResizeDeltaTicks) {
      deltaTicks = this.draft.maximumResizeDeltaTicks;
    }

    if (deltaTicks === this.draft.deltaTicks) {
      return "none";
    }

    this.draft.deltaTicks = deltaTicks;
    return "updateResize";
  }

  private updateDraw(
    pointerTick: number,
    totalTicks: number,
  ): GestureUpdateKind {
    const snappedEndTick = quantizeTick(
      pointerTick,
      this.draft.snapResolutionTicks,
    );
    const durationTicks = Math.min(
      totalTicks - this.draft.drawStartTick,
      Math.max(
        this.draft.snapResolutionTicks,
        snappedEndTick - this.draft.drawStartTick,
      ),
    );

    if (durationTicks === this.draft.drawDurationTicks) {
      return "none";
    }

    this.draft.drawDurationTicks = durationTicks;
    return "updateDraw";
  }
}
