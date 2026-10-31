import { createSession, CUE_MAX_LATE_MS } from './session';

const cfg = { rounds: 2, roundSeconds: 180, restSeconds: 60 };

function started() {
  let t = 1000;
  const session = createSession(cfg, () => t);
  session.start();
  return { session, advance: (ms: number) => { t += ms; } };
}

test('each cue fires once', () => {
  const { session, advance } = started();
  advance(3000);
  expect(session.poll()).toEqual(['roundStart']);
  expect(session.poll()).toEqual([]);
});

test('no cue before its time', () => {
  const { session, advance } = started();
  advance(2999);
  expect(session.poll()).toEqual([]);
});

test('background gap drops overdue cues and lands on the right phase', () => {
  const { session, advance } = started();
  advance(4000);
  session.poll();
  advance(196000);
  expect(session.poll()).toEqual([]);
  expect(session.state()).toEqual({ phase: 'rest', round: 1, remainingMs: 43000 });
});

test('a cue slightly late still fires', () => {
  const { session, advance } = started();
  advance(3000 + CUE_MAX_LATE_MS);
  expect(session.poll()).toEqual(['roundStart']);
});

test('a cue later than the limit is dropped', () => {
  const { session, advance } = started();
  advance(3000 + CUE_MAX_LATE_MS + 1);
  expect(session.poll()).toEqual([]);
});

test('workout ending in background is silent and finished', () => {
  const { session, advance } = started();
  advance(4000);
  session.poll();
  advance(995999);
  expect(session.poll()).toEqual([]);
  expect(session.state().phase).toBe('finished');
});

test('pause freezes time and cues; resume keeps remaining time', () => {
  const { session, advance } = started();
  advance(170000);
  session.poll();
  session.pause();
  const before = session.state().remainingMs;
  advance(60000);
  expect(session.isPaused()).toBe(true);
  expect(session.poll()).toEqual([]);
  expect(session.state().remainingMs).toBe(before);
  session.resume();
  advance(3000);
  expect(session.poll()).toEqual(['warning']);
});
