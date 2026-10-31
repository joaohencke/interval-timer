export type Config = { rounds: number; roundSeconds: number; restSeconds: number };
export type Phase = 'countdown' | 'round' | 'rest' | 'finished';
export type CueKind = 'warning' | 'roundStart' | 'roundEnd';
export type Cue = { atMs: number; kind: CueKind };
export type Segment = {
  phase: Exclude<Phase, 'finished'>;
  round: number;
  startMs: number;
  durationMs: number;
};
export type Timeline = { segments: Segment[]; cues: Cue[]; totalMs: number };
export type PhaseState = { phase: Phase; round: number; remainingMs: number };

const COUNTDOWN_MS = 3000;
const WARNING_MS = 10000;

export function buildTimeline(config: Config): Timeline {
  const roundMs = config.roundSeconds * 1000;
  const restMs = config.restSeconds * 1000;
  const segments: Segment[] = [{ phase: 'countdown', round: 1, startMs: 0, durationMs: COUNTDOWN_MS }];
  const cues: Cue[] = [{ atMs: COUNTDOWN_MS, kind: 'roundStart' }];
  let at = COUNTDOWN_MS;

  for (let round = 1; round <= config.rounds; round++) {
    segments.push({ phase: 'round', round, startMs: at, durationMs: roundMs });
    at += roundMs;
    cues.push({ atMs: at - WARNING_MS, kind: 'warning' }, { atMs: at, kind: 'roundEnd' });

    if (round < config.rounds) {
      segments.push({ phase: 'rest', round, startMs: at, durationMs: restMs });
      at += restMs;
      cues.push({ atMs: at - WARNING_MS, kind: 'warning' }, { atMs: at, kind: 'roundStart' });
    }
  }

  return { segments, cues, totalMs: at };
}

export function stateAt(timeline: Timeline, elapsedMs: number): PhaseState {
  for (const segment of timeline.segments) {
    const end = segment.startMs + segment.durationMs;
    if (elapsedMs < end) {
      return { phase: segment.phase, round: segment.round, remainingMs: end - elapsedMs };
    }
  }
  const last = timeline.segments[timeline.segments.length - 1];
  return { phase: 'finished', round: last.round, remainingMs: 0 };
}

export function totalWorkoutSeconds(config: Config): number {
  return config.rounds * config.roundSeconds + (config.rounds - 1) * config.restSeconds;
}

export function formatTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
