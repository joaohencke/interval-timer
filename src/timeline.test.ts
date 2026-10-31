import { buildTimeline, formatTime, stateAt, totalWorkoutSeconds } from './timeline';

const cfg = { rounds: 2, roundSeconds: 180, restSeconds: 60 };

test('total follows the spec formula', () => {
  expect(totalWorkoutSeconds({ rounds: 5, roundSeconds: 180, restSeconds: 60 })).toBe(19 * 60);
});

test('cues in order', () => {
  expect(buildTimeline(cfg).cues).toEqual([
    { atMs: 3000, kind: 'roundStart' },
    { atMs: 173000, kind: 'warning' },
    { atMs: 183000, kind: 'roundEnd' },
    { atMs: 233000, kind: 'warning' },
    { atMs: 243000, kind: 'roundStart' },
    { atMs: 413000, kind: 'warning' },
    { atMs: 423000, kind: 'roundEnd' },
  ]);
});

test('one round has no rest', () => {
  const t = buildTimeline({ rounds: 1, roundSeconds: 180, restSeconds: 60 });
  expect(t.segments.map((s) => s.phase)).toEqual(['countdown', 'round']);
  expect(t.totalMs).toBe(183000);
});

test('stateAt boundaries', () => {
  const t = buildTimeline(cfg);
  expect(stateAt(t, 0)).toEqual({ phase: 'countdown', round: 1, remainingMs: 3000 });
  expect(stateAt(t, 3000)).toEqual({ phase: 'round', round: 1, remainingMs: 180000 });
  expect(stateAt(t, 183000)).toEqual({ phase: 'rest', round: 1, remainingMs: 60000 });
  expect(stateAt(t, 243000)).toEqual({ phase: 'round', round: 2, remainingMs: 180000 });
  expect(stateAt(t, 423000)).toEqual({ phase: 'finished', round: 2, remainingMs: 0 });
  expect(stateAt(t, 999999).phase).toBe('finished');
});

test('formatTime rounds up', () => {
  expect(formatTime(123000)).toBe('2:03');
  expect(formatTime(122001)).toBe('2:03');
  expect(formatTime(0)).toBe('0:00');
  expect(formatTime(3600000)).toBe('60:00');
});
