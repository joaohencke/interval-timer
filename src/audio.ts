import type { CueKind } from './timeline';

export type Audio = {
  unlock(): Promise<void>;
  play(kind: CueKind): void;
  recover(): Promise<boolean>;
  isRunning(): boolean;
};

type Beep = { at: number; duration: number; from: number; to?: number };
// A bell strike is a sum of decaying sine partials: [frequency ratio, amplitude, decay time constant in s].
type Strike = { at: number; level: number };
type Sound = { beeps: Beep[] } | { strikes: Strike[] };

const RESUME_TIMEOUT_MS = 500;
const VOLUME = 0.8;

// Boxing-ring bell: inharmonic plate partials, plus a near-unison one that beats for a metallic shimmer.
const BELL_HZ = 1050;
const BELL_PARTIALS: [number, number, number][] = [
  [1, 1, 0.9],
  [1.007, 0.5, 0.9],
  [2.76, 0.6, 0.45],
  [5.4, 0.35, 0.25],
  [8.93, 0.2, 0.12],
];
// Partials are silent (~ -80 dB) after this many time constants.
const BELL_TAIL = 9;
const BELL_ATTACK = 0.003;
// A lone strike peaks at ~2.6x its level. Three strikes 0.28 s apart measure about the same in Chromium,
// but could reach ~4.1x if their partials lined up, so the triple bell keeps headroom to never clip.
const SINGLE_LEVEL = VOLUME / 2.65;
const TRIPLE_LEVEL = VOLUME / 3.3;

const PATTERNS: Record<CueKind, Sound> = {
  warning: {
    beeps: [
      { at: 0, duration: 0.15, from: 880 },
      { at: 0.25, duration: 0.15, from: 880 },
    ],
  },
  roundStart: { strikes: [{ at: 0, level: SINGLE_LEVEL }] },
  roundEnd: {
    strikes: [
      { at: 0, level: TRIPLE_LEVEL },
      { at: 0.28, level: TRIPLE_LEVEL },
      { at: 0.56, level: TRIPLE_LEVEL },
    ],
  },
};

function playBeep(ctx: AudioContext, beep: Beep, start: number) {
  const at = start + beep.at;
  const end = at + beep.duration;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(beep.from, at);
  if (beep.to) osc.frequency.exponentialRampToValueAtTime(beep.to, end);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(VOLUME, at + 0.01);
  gain.gain.setValueAtTime(VOLUME, end - 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(end + 0.01);
}

function playStrike(ctx: AudioContext, strike: Strike, start: number) {
  const at = start + strike.at;
  for (const [ratio, amp, decay] of BELL_PARTIALS) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(BELL_HZ * ratio, at);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(amp * strike.level, at + BELL_ATTACK);
    gain.gain.setTargetAtTime(0, at + BELL_ATTACK, decay);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + BELL_ATTACK + decay * BELL_TAIL);
  }
}

type AudioWindow = Window & { AudioContext: typeof AudioContext };
type SessionNavigator = Navigator & { audioSession?: { type: string } };

export function createAudio(win: Window = window): Audio {
  let ctx: AudioContext | null = null;

  // iOS can leave resume() pending forever after an interruption.
  const resumeWithTimeout = async (context: AudioContext) => {
    await Promise.race([
      context.resume().catch(() => undefined),
      new Promise((done) => setTimeout(done, RESUME_TIMEOUT_MS)),
    ]);
  };

  return {
    async unlock() {
      if (!ctx) {
        // Must come before the context exists. 'ambient' mixes over music; 'playback' stops it.
        const session = (win.navigator as SessionNavigator).audioSession;
        if (session) session.type = 'ambient';
        ctx = new (win as AudioWindow).AudioContext();
      }
      await resumeWithTimeout(ctx);
    },

    play(kind) {
      // A suspended context has a frozen clock: anything scheduled now would all sound at once on resume.
      if (ctx?.state !== 'running') return;
      const start = ctx.currentTime + 0.02;
      const sound = PATTERNS[kind];
      if ('beeps' in sound) for (const beep of sound.beeps) playBeep(ctx, beep, start);
      else for (const strike of sound.strikes) playStrike(ctx, strike, start);
    },

    async recover() {
      if (!ctx) return false;
      if (ctx.state !== 'running') await resumeWithTimeout(ctx);
      return ctx.state === 'running';
    },

    isRunning() {
      return ctx?.state === 'running';
    },
  };
}
