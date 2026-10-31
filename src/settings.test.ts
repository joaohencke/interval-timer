import { DEFAULTS, loadConfig, saveConfig, step } from './settings';

function memoryStorage(initial?: string): Storage {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    seed: (value: string) => {
      for (const key of ['interval-timer:config']) data.set(key, value);
    },
  };
  if (initial !== undefined) storage.seed(initial);
  return storage as unknown as Storage;
}

const throwing = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
} as unknown as Storage;

test('no saved value returns defaults', () => {
  expect(loadConfig(memoryStorage())).toEqual({ rounds: 5, roundSeconds: 180, restSeconds: 60 });
});

test('save then load round-trips', () => {
  const storage = memoryStorage();
  saveConfig({ rounds: 8, roundSeconds: 300, restSeconds: 45 }, storage);
  expect(loadConfig(storage)).toEqual({ rounds: 8, roundSeconds: 300, restSeconds: 45 });
});

test('invalid JSON returns defaults', () => {
  expect(loadConfig(memoryStorage('{oops'))).toEqual(DEFAULTS);
});

test('JSON that is not an object returns defaults', () => {
  expect(loadConfig(memoryStorage('null'))).toEqual(DEFAULTS);
});

test('out-of-range and non-numeric fields fall back per field', () => {
  const stored = JSON.stringify({ rounds: 0, roundSeconds: 'x', restSeconds: 60 });
  expect(loadConfig(memoryStorage(stored))).toEqual({ rounds: 1, roundSeconds: 180, restSeconds: 60 });
});

test('values above the limit clamp, and fractions round to a whole step', () => {
  const stored = JSON.stringify({ rounds: 2.5, roundSeconds: 99999, restSeconds: 61 });
  const loaded = loadConfig(memoryStorage(stored));
  expect(loaded.roundSeconds).toBe(3600);
  expect(Number.isInteger(loaded.rounds)).toBe(true);
  expect(loaded.restSeconds).toBe(60);
});

test('storage that throws does not break load or save', () => {
  expect(loadConfig(throwing)).toEqual(DEFAULTS);
  expect(() => saveConfig(DEFAULTS, throwing)).not.toThrow();
});

test('step moves by the field increment', () => {
  expect(step(DEFAULTS, 'rounds', 1).rounds).toBe(6);
  expect(step(DEFAULTS, 'roundSeconds', -1).roundSeconds).toBe(165);
  expect(step(DEFAULTS, 'restSeconds', 1).restSeconds).toBe(75);
});

test('step clamps at limits', () => {
  expect(step({ ...DEFAULTS, rounds: 1 }, 'rounds', -1).rounds).toBe(1);
  expect(step({ ...DEFAULTS, roundSeconds: 3600 }, 'roundSeconds', 1).roundSeconds).toBe(3600);
  expect(step({ ...DEFAULTS, restSeconds: 15 }, 'restSeconds', -1).restSeconds).toBe(15);
});
