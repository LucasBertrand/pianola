import type { LoopRegion, TransportState } from "../transport/transport";
import { collapseTickForRemovedTime } from "./removed-time-tick";

export function insertTimeIntoTransport(
  transport: TransportState,
  insertionTick: number,
  insertedTicks: number,
): TransportState {
  const loop = {
    startTick: transport.loop.startTick >= insertionTick
      ? transport.loop.startTick + insertedTicks
      : transport.loop.startTick,
    endTick: transport.loop.endTick >= insertionTick
      ? transport.loop.endTick + insertedTicks
      : transport.loop.endTick,
  };
  if (
    loop.startTick === transport.loop.startTick
    && loop.endTick === transport.loop.endTick
  ) return transport;
  return { ...transport, loop };
}

export function removeTimeFromTransport(
  transport: TransportState,
  removalStartTick: number,
  removalEndTick: number,
  projectDurationTicks: number,
): TransportState {
  const collapsedLoop = {
    startTick: collapseTickForRemovedTime(
      transport.loop.startTick,
      removalStartTick,
      removalEndTick,
    ),
    endTick: collapseTickForRemovedTime(
      transport.loop.endTick,
      removalStartTick,
      removalEndTick,
    ),
  };
  const loop = collapsedLoop.endTick > collapsedLoop.startTick
    ? fitLoopRegionToProject(collapsedLoop, projectDurationTicks)
    : createFallbackLoopRegion(
        removalStartTick,
        transport.loop.endTick - transport.loop.startTick,
        projectDurationTicks,
      );
  if (
    loop.startTick === transport.loop.startTick
    && loop.endTick === transport.loop.endTick
  ) return transport;
  return { ...transport, loop };
}

export function fitLoopRegionToProject(
  loop: LoopRegion,
  projectDurationTicks: number,
): LoopRegion {
  if (loop.endTick <= projectDurationTicks) return loop;
  if (loop.startTick < projectDurationTicks) {
    return { startTick: loop.startTick, endTick: projectDurationTicks };
  }
  return createFallbackLoopRegion(
    projectDurationTicks,
    loop.endTick - loop.startTick,
    projectDurationTicks,
  );
}

function createFallbackLoopRegion(
  preferredStartTick: number,
  preferredDurationTicks: number,
  projectDurationTicks: number,
): LoopRegion {
  const durationTicks = Math.max(
    1,
    Math.min(preferredDurationTicks, projectDurationTicks),
  );
  const startTick = Math.min(
    preferredStartTick,
    projectDurationTicks - durationTicks,
  );
  return { startTick, endTick: startTick + durationTicks };
}
