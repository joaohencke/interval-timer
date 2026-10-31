import type { Mock } from 'vitest';
import type { Audio } from '../audio';
import type { WakeLock } from '../wakeLock';
import { mountWorkoutScreen } from './workoutScreen';

const config = { rounds: 2, roundSeconds: 30, restSeconds: 15 };

let root: HTMLElement;
let audio: { play: Mock<Audio['play']>; recover: Mock<Audio['recover']> };
let wakeLock: { acquire: Mock<WakeLock['acquire']>; release: Mock<WakeLock['release']> };
let onExit: Mock<() => void>;
let cleanup: () => void;

const q = (selector: string) => root.querySelector<HTMLElement>(selector)!;
const buttons = () => [...root.querySelectorAll('button')].map((b) => b.textContent);
const click = (label: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === label)!.click();

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement('div');
  audio = { play: vi.fn(), recover: vi.fn(async () => true) };
  wakeLock = { acquire: vi.fn(async () => {}), release: vi.fn(async () => {}) };
  onExit = vi.fn();
  cleanup = mountWorkoutScreen(root, { config, audio, wakeLock }, onExit);
});

afterEach(() => {
  cleanup();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  vi.useRealTimers();
});

test('countdown, then round label and "1 de 2"', () => {
  expect(q('.time').textContent).toBe('3');
  vi.advanceTimersByTime(3000);
  expect(q('.phase').textContent).toBe('ROUND');
  expect(q('.phase').classList.contains('round')).toBe(true);
  expect(q('.detail').textContent).toBe('1 de 2');
  expect(q('.time').textContent).toBe('0:30');
});

test('rest shows DESCANSO and "Próximo: round 2 de 2"', () => {
  vi.advanceTimersByTime(33000);
  expect(q('.phase').textContent).toBe('DESCANSO');
  expect(q('.phase').classList.contains('rest')).toBe(true);
  expect(q('.detail').textContent).toBe('Próximo: round 2 de 2');
  expect(q('.time').textContent).toBe('0:15');
});

test('plays each cue at its time', () => {
  vi.advanceTimersByTime(2900);
  expect(audio.play).not.toHaveBeenCalled();
  vi.advanceTimersByTime(200);
  expect(audio.play.mock.calls).toEqual([['roundStart']]);
  vi.advanceTimersByTime(20000);
  expect(audio.play).toHaveBeenLastCalledWith('warning');
  vi.advanceTimersByTime(10000);
  expect(audio.play).toHaveBeenLastCalledWith('roundEnd');
  vi.advanceTimersByTime(60000);
  expect(audio.play.mock.calls.flat()).toEqual([
    'roundStart', 'warning', 'roundEnd', 'warning', 'roundStart', 'warning', 'roundEnd',
  ]);
});

test('Pausar toggles to Retomar, freezes time and cues', () => {
  vi.advanceTimersByTime(4000);
  audio.play.mockClear();
  click('Pausar');
  expect(buttons()).toEqual(['Retomar', 'Parar']);
  const shown = q('.time').textContent;
  vi.advanceTimersByTime(60000);
  expect(q('.time').textContent).toBe(shown);
  expect(audio.play).not.toHaveBeenCalled();
  click('Retomar');
  vi.advanceTimersByTime(1000);
  expect(q('.time').textContent).not.toBe(shown);
});

test('has only Pausar and Parar controls', () => {
  expect(buttons()).toEqual(['Pausar', 'Parar']);
});

test('Parar exits, and no cue plays afterwards', () => {
  click('Parar');
  expect(onExit).toHaveBeenCalledOnce();
  expect(wakeLock.release).toHaveBeenCalled();
  vi.advanceTimersByTime(60000);
  expect(audio.play).not.toHaveBeenCalled();
});

test('finished state shows Novo treino, and it exits', () => {
  vi.advanceTimersByTime(78000);
  expect(q('.phase').textContent).toBe('FIM');
  expect(wakeLock.release).toHaveBeenCalled();
  expect(buttons()).toEqual(['Novo treino']);
  click('Novo treino');
  expect(onExit).toHaveBeenCalledOnce();
});

test('on return to visible: reacquires wake lock and recovers audio', async () => {
  wakeLock.acquire.mockClear();
  setVisibility('hidden');
  expect(audio.recover).not.toHaveBeenCalled();
  setVisibility('visible');
  await vi.advanceTimersByTimeAsync(0);
  expect(wakeLock.acquire).toHaveBeenCalledOnce();
  expect(audio.recover).toHaveBeenCalledOnce();
  expect(q('.sound-banner').hidden).toBe(true);
});

test('return to visible after the workout ended does not hold the screen on', async () => {
  setVisibility('hidden');
  vi.advanceTimersByTime(200000);
  wakeLock.acquire.mockClear();
  setVisibility('visible');
  await vi.advanceTimersByTimeAsync(0);
  expect(q('.phase').textContent).toBe('FIM');
  expect(wakeLock.acquire).not.toHaveBeenCalled();
});

test('if recovery fails: shows a tap-to-restore-sound banner and timer keeps running', async () => {
  vi.advanceTimersByTime(4000);
  audio.recover.mockResolvedValueOnce(false);
  setVisibility('visible');
  await vi.advanceTimersByTimeAsync(0);
  const banner = q('.sound-banner');
  expect(banner.hidden).toBe(false);
  const shown = q('.time').textContent;
  await vi.advanceTimersByTimeAsync(2000);
  expect(q('.time').textContent).not.toBe(shown);

  audio.recover.mockResolvedValueOnce(true);
  banner.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(q('.sound-banner').hidden).toBe(true);
});

test('cleanup stops the timer', () => {
  cleanup();
  vi.advanceTimersByTime(60000);
  expect(audio.play).not.toHaveBeenCalled();
});
