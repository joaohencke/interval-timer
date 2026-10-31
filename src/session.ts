import { buildTimeline, stateAt, type Config, type CueKind, type PhaseState } from './timeline';

export const CUE_MAX_LATE_MS = 1000;

export type Session = {
  start(): void;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  state(): PhaseState;
  poll(): CueKind[];
};

export function createSession(config: Config, now: () => number = Date.now): Session {
  const timeline = buildTimeline(config);
  let accumulatedMs = 0;
  let resumedAt: number | null = null;
  let lastPolledMs = 0;

  const elapsed = () => accumulatedMs + (resumedAt === null ? 0 : now() - resumedAt);

  return {
    start() {
      accumulatedMs = 0;
      lastPolledMs = 0;
      resumedAt = now();
    },
    pause() {
      if (resumedAt === null) return;
      accumulatedMs = elapsed();
      resumedAt = null;
    },
    resume() {
      if (resumedAt === null) resumedAt = now();
    },
    isPaused() {
      return resumedAt === null;
    },
    state() {
      return stateAt(timeline, elapsed());
    },
    poll() {
      const current = elapsed();
      const due = timeline.cues.filter(
        (cue) => cue.atMs > lastPolledMs && cue.atMs <= current && current - cue.atMs <= CUE_MAX_LATE_MS,
      );
      lastPolledMs = current;
      return due.map((cue) => cue.kind);
    },
  };
}
