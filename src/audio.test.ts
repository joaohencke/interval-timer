import { createAudio } from './audio';

type Tone = { frequency: number; startAt: number };

function fakeWindow(options: { audioSession?: boolean; resume?: () => Promise<void>; initialState?: string } = {}) {
  const events: string[] = [];
  const tones: Tone[] = [];
  const audioSession = { _type: 'auto', set type(value: string) { events.push(`session:${value}`); this._type = value; }, get type() { return this._type; } };

  class FakeAudioContext {
    state = options.initialState ?? 'running';
    currentTime = 0;
    destination = {};
    constructor() { events.push('context'); }
    resume = options.resume ?? (async () => { this.state = 'running'; });
    createOscillator() {
      const osc = {
        type: '',
        frequency: { value: 0, setValueAtTime: (v: number) => { osc.frequency.value = v; } , exponentialRampToValueAtTime: (v: number) => { osc.frequency.value = v; } },
        connect: (node: unknown) => node,
        start: (at: number) => tones.push({ frequency: osc.frequency.value, startAt: at }),
        stop: () => {},
      };
      return osc;
    }
    createGain() {
      return {
        gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: (node: unknown) => node,
      };
    }
  }

  const win = {
    AudioContext: FakeAudioContext,
    navigator: options.audioSession === false ? {} : { audioSession },
  } as unknown as Window;
  return { win, events, tones };
}

test('sets ambient before creating the context', async () => {
  const { win, events } = fakeWindow();
  await createAudio(win).unlock();
  expect(events).toEqual(['session:ambient', 'context']);
});

test('works when audioSession is absent', async () => {
  const { win, tones } = fakeWindow({ audioSession: false });
  const audio = createAudio(win);
  await audio.unlock();
  audio.play('warning');
  expect(tones.length).toBeGreaterThan(0);
});

test('play before unlock does not throw or sound', () => {
  const { win, tones } = fakeWindow();
  expect(() => createAudio(win).play('warning')).not.toThrow();
  expect(tones).toEqual([]);
});

test('the three cues produce different sound patterns', async () => {
  const { win, tones } = fakeWindow();
  const audio = createAudio(win);
  await audio.unlock();
  const pattern = (kind: 'warning' | 'roundStart' | 'roundEnd') => {
    tones.length = 0;
    audio.play(kind);
    return JSON.stringify(tones);
  };
  const patterns = new Set([pattern('warning'), pattern('roundStart'), pattern('roundEnd')]);
  expect(patterns.size).toBe(3);
});

test('recover returns true once the context runs', async () => {
  const { win } = fakeWindow({ initialState: 'interrupted', resume: undefined });
  const audio = createAudio(win);
  await audio.unlock();
  await expect(audio.recover()).resolves.toBe(true);
});

test('recover returns false if the context stays suspended', async () => {
  const { win } = fakeWindow({ initialState: 'suspended', resume: async () => {} });
  const audio = createAudio(win);
  await audio.unlock();
  await expect(audio.recover()).resolves.toBe(false);
});

test('recover returns false if resume never settles', async () => {
  vi.useFakeTimers();
  try {
    const { win } = fakeWindow({ initialState: 'interrupted', resume: () => new Promise(() => {}) });
    const audio = createAudio(win);
    const unlocked = audio.unlock();
    await vi.advanceTimersByTimeAsync(1000);
    await unlocked;
    const recovered = audio.recover();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(recovered).resolves.toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test('recover before unlock returns false', async () => {
  const { win } = fakeWindow();
  await expect(createAudio(win).recover()).resolves.toBe(false);
});

test('cues while suspended are dropped, so resuming plays no backlog', async () => {
  const { win, tones } = fakeWindow({ initialState: 'suspended', resume: async () => {} });
  const audio = createAudio(win);
  await audio.unlock();
  audio.play('warning');
  audio.play('roundEnd');
  expect(tones).toEqual([]);
});

test('isRunning reflects the context state', async () => {
  const stuck = fakeWindow({ initialState: 'interrupted', resume: async () => {} });
  const audio = createAudio(stuck.win);
  expect(audio.isRunning()).toBe(false);
  await audio.unlock();
  expect(audio.isRunning()).toBe(false);

  const fine = createAudio(fakeWindow().win);
  await fine.unlock();
  expect(fine.isRunning()).toBe(true);
});
