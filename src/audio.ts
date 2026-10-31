import type { CueKind } from './timeline';

export type Audio = {
  unlock(): Promise<void>;
  play(kind: CueKind): void;
  recover(): Promise<boolean>;
  isRunning(): boolean;
};

type Beep = { at: number; duration: number; from: number; to?: number };

const RESUME_TIMEOUT_MS = 500;
const VOLUME = 0.8;

const PATTERNS: Record<CueKind, Beep[]> = {
  warning: [
    { at: 0, duration: 0.15, from: 880 },
    { at: 0.25, duration: 0.15, from: 880 },
  ],
  roundStart: [{ at: 0, duration: 0.7, from: 660, to: 1320 }],
  roundEnd: [
    { at: 0, duration: 0.5, from: 330 },
    { at: 0.65, duration: 0.5, from: 330 },
    { at: 1.3, duration: 0.5, from: 330 },
  ],
};

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
      for (const beep of PATTERNS[kind]) {
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
