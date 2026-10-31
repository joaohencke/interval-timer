# Interval Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installable offline PWA that runs a fight-training interval workout hands-free, with audio cues mixed over background music on iPhone.

**Architecture:** Pure timeline logic turns a config into segments and cues. A session derives all state from elapsed wall-clock time, so background gaps need no special replay. Thin browser adapters (audio, wake lock, storage) and two DOM screens sit on top.

**Tech Stack:** TypeScript, Vite, no UI framework, `vite-plugin-pwa`, Vitest with happy-dom, GitHub Pages with GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-31-interval-timer-design.md`

## Global Constraints

- Audio: set `navigator.audioSession.type = 'ambient'` (when available) before creating the `AudioContext`. Never use `playback`; it stops the music.
- Never use a hidden looping video for wake lock; it can stop the music.
- Same round and rest durations for all rounds. No rest after the last round.
- Start countdown: 3 s. Warning cue: 10 s before the end of every round and rest.
- Out of scope: accounts, history, presets, per-round durations, skip button.
- UI copy in pt-BR: `ROUND`, `DESCANSO`, `2 de 5`, `Próximo: round 3 de 5`, `Pausar`, `Parar`, `Iniciar`.
- Workout screen: dark background, huge `m:ss`, ROUND label green, DESCANSO label blue.
- Use `Date.now()` for time, not `performance.now()` or tick counting, so time survives app suspension.
- No server or login. Settings persist in `localStorage`.

## Review Focus

Each has a pinned test or manual check in its owning task.

1. Returning from background after several phases passed: shows the correct phase and plays no overdue sound (Task 2).
2. Workout ending while in background: returns to the finished state, silently (Task 2).
3. Corrupt or out-of-range saved settings: falls back to safe values instead of breaking startup (Task 3).
4. Pausing across a cue: the cue fires once after resuming, at the correct remaining time (Task 2).
5. iOS leaves audio suspended after a call: app offers a visible tap to restore sound, and the timer never stops (Task 4).

---

### Task 1: Project, deploy and Wake Lock gate

This is the first milestone from the spec. Stop at Step 7 until the user reports the result.

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/wakeLock.ts`, `public/icon.svg`, `.gitignore`, `.github/workflows/deploy.yml`
- Test: `src/wakeLock.test.ts`

**Interfaces:**
- Produces: `createWakeLock(nav?: Navigator): { acquire(): Promise<void>; release(): Promise<void>; isActive(): boolean }` in `src/wakeLock.ts`.

- [ ] **Step 1: Scaffold**

`git init`; install `vite`, `typescript`, `vitest`, `happy-dom`, `vite-plugin-pwa`, `@vite-pwa/assets-generator` as dev dependencies. Add scripts `dev`, `build`, `test`. `.gitignore` covers `node_modules/`, `dist/`, `.superpowers/`. Vite config: `base: '/interval-timer/'`, PWA plugin with `registerType: 'autoUpdate'`, `display: 'standalone'`, dark theme and background colors, precache of all build assets. Generate icons from `public/icon.svg` with `pwa-assets-generator --preset minimal-2023`.

- [ ] **Step 2: Write failing tests in `src/wakeLock.test.ts`**

```ts
test('acquire without wakeLock API resolves and stays inactive', async () => {
  const lock = createWakeLock({} as Navigator);
  await lock.acquire();
  expect(lock.isActive()).toBe(false);
});
test('acquire rejected by the browser does not throw', async () => {
  const nav = { wakeLock: { request: () => Promise.reject(new Error('denied')) } };
  const lock = createWakeLock(nav as unknown as Navigator);
  await expect(lock.acquire()).resolves.toBeUndefined();
  expect(lock.isActive()).toBe(false);
});
test('isActive goes false after the sentinel releases', async () => { /* fake sentinel fires release */ });
```

- [ ] **Step 3: Run `npm test`.** Expected: FAIL, `createWakeLock` not defined.

- [ ] **Step 4: Implement `createWakeLock`.** Run `npm test`. Expected: PASS.

- [ ] **Step 5: Build the probe page in `index.html` and `src/main.ts`**

Button `Iniciar teste` acquires the lock and starts the same ambient beep every 5 s used in the validated spike. On screen: installed or not, wake lock active or not, elapsed time. Reacquire on `visibilitychange` to visible.

- [ ] **Step 6: Deploy**

Add a GitHub Actions workflow that runs tests, builds, and deploys `dist` with `actions/upload-pages-artifact` and `actions/deploy-pages` on push to `main`. Confirm with the user before creating the repo, since Pages on a free plan needs it public. Then `gh repo create interval-timer --public --source . --push` and enable Pages with workflow builds. Verify with `curl -I https://<user>.github.io/interval-timer/`. Expected: `200`.

- [ ] **Step 7: User gate on iPhone**

User installs from Safari, opens from the icon, sets Auto-Lock to a short value (not Never), plays Spotify, starts the test, and leaves the phone untouched past the Auto-Lock period. Record iOS version and result.

- Screen stays on and beeps continue: pass; continue to Task 2.
- Screen locks: apply plan B in Task 5 (the Auto-Lock reminder) and note it in the spec.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: scaffold PWA and wake lock probe"
```

(`.superpowers/` stays ignored. This commit includes `docs/`. Push before Step 6's verification.)

---

### Task 2: Timeline and session logic

**Files:**
- Create: `src/timeline.ts`, `src/session.ts`
- Test: `src/timeline.test.ts`, `src/session.test.ts`

**Interfaces:**
- Produces in `src/timeline.ts`:

```ts
export type Config = { rounds: number; roundSeconds: number; restSeconds: number };
export type Phase = 'countdown' | 'round' | 'rest' | 'finished';
export type CueKind = 'warning' | 'roundStart' | 'roundEnd';
export type Cue = { atMs: number; kind: CueKind };
export type Segment = { phase: Exclude<Phase, 'finished'>; round: number; startMs: number; durationMs: number };
export type Timeline = { segments: Segment[]; cues: Cue[]; totalMs: number };
export type PhaseState = { phase: Phase; round: number; remainingMs: number };
export function buildTimeline(config: Config): Timeline;
export function stateAt(timeline: Timeline, elapsedMs: number): PhaseState;
export function totalWorkoutSeconds(config: Config): number; // excludes the 3 s countdown
export function formatTime(ms: number): string; // rounds up to whole seconds, as m:ss
```

- Produces in `src/session.ts`:

```ts
export function createSession(config: Config, now?: () => number): {
  start(): void; pause(): void; resume(): void;
  isPaused(): boolean;
  state(): PhaseState;
  poll(): CueKind[]; // cues due since the last poll, excluding overdue ones
};
export const CUE_MAX_LATE_MS = 1000;
```

- [ ] **Step 1: Write failing tests in `src/timeline.test.ts`**

With `cfg = { rounds: 2, roundSeconds: 180, restSeconds: 60 }`:

```ts
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
});
test('stateAt boundaries', () => {
  const t = buildTimeline(cfg);
  expect(stateAt(t, 0)).toEqual({ phase: 'countdown', round: 1, remainingMs: 3000 });
  expect(stateAt(t, 3000)).toEqual({ phase: 'round', round: 1, remainingMs: 180000 });
  expect(stateAt(t, 183000)).toEqual({ phase: 'rest', round: 1, remainingMs: 60000 });
  expect(stateAt(t, 423000)).toEqual({ phase: 'finished', round: 2, remainingMs: 0 });
  expect(stateAt(t, 999999).phase).toBe('finished');
});
test('formatTime rounds up', () => {
  expect(formatTime(123000)).toBe('2:03');
  expect(formatTime(122001)).toBe('2:03');
  expect(formatTime(0)).toBe('0:00');
});
```

- [ ] **Step 2: Write failing tests in `src/session.test.ts`**

Use a controllable `now`, with `cfg` as above:

```ts
test('each cue fires once', () => { /* at 3000: ['roundStart']; poll again: [] */ });
test('background gap drops overdue cues and lands on the right phase', () => {
  // poll at 4000, jump to 200000: poll() is []; state() is rest of round 1, remainingMs 43000
});
test('a cue slightly late still fires', () => { /* jump to 3000 + CUE_MAX_LATE_MS: ['roundStart'] */ });
test('workout ending in background is silent and finished', () => {
  // poll at 4000, jump to 999999: poll() is []; state().phase is 'finished'
});
test('pause freezes time and cues; resume keeps remaining time', () => {
  // pause at 170000, advance 60000: poll() is [], remainingMs unchanged
  // resume, advance 3000: poll() is ['warning']
});
```

- [ ] **Step 3: Run `npm test`.** Expected: FAIL, functions not defined.

- [ ] **Step 4: Implement `src/timeline.ts` and `src/session.ts`.** Session elapsed = accumulated time plus `now() - resumedAt`. `poll` considers cues in `(lastPolledElapsed, elapsed]` and returns only those with `elapsed - atMs <= CUE_MAX_LATE_MS`.

- [ ] **Step 5: Run `npm test`.** Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/timeline* src/session* && git commit -m "feat: add workout timeline and session logic"
```

---

### Task 3: Settings

**Files:**
- Create: `src/settings.ts`
- Test: `src/settings.test.ts`

**Interfaces:**
- Consumes: `Config` from Task 2.
- Produces:

```ts
export const DEFAULTS: Config; // rounds 5, roundSeconds 180, restSeconds 60
export const LIMITS: {
  rounds: { min: 1; max: 99; step: 1 };
  roundSeconds: { min: 15; max: 3600; step: 15 };
  restSeconds: { min: 15; max: 3600; step: 15 };
};
export function step(config: Config, key: keyof Config, direction: 1 | -1): Config;
export function loadConfig(storage?: Storage): Config;
export function saveConfig(config: Config, storage?: Storage): void;
```

The 15 s minimum is the builder's call: it keeps the 10 s warning inside every phase.

- [ ] **Step 1: Write failing tests**

```ts
test('no saved value returns defaults', ...);
test('save then load round-trips', ...);
test('invalid JSON returns defaults', () => { /* storage holds '{oops' */ });
test('out-of-range and non-numeric fields fall back per field', () => {
  // { rounds: 0, roundSeconds: 'x', restSeconds: 60 } loads as { rounds: 1, roundSeconds: 180, restSeconds: 60 }
});
test('storage that throws does not break load or save', ...);
test('step clamps at limits', () => { /* rounds 1 with -1 stays 1; roundSeconds 3600 with +1 stays 3600 */ });
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.

- [ ] **Step 3: Implement `src/settings.ts`.** Out-of-range numbers clamp; non-numeric values use the default.

- [ ] **Step 4: Run `npm test`.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings* && git commit -m "feat: add persisted settings"
```

---

### Task 4: Audio

**Files:**
- Create: `src/audio.ts`
- Test: `src/audio.test.ts`

**Interfaces:**
- Consumes: `CueKind` from Task 2.
- Produces:

```ts
export function createAudio(win?: Window): {
  unlock(): Promise<void>; // must run inside a user tap
  play(kind: CueKind): void;
  recover(): Promise<boolean>; // true if the context is running
};
```

- [ ] **Step 1: Write failing tests with a fake `AudioContext`**

```ts
test('sets ambient before creating the context', ...); // record call order
test('works when audioSession is absent', ...);
test('never sets playback', ...);
test('play before unlock does not throw', ...);
test('the three cues produce different sound patterns', ...); // compare recorded oscillator params
test('recover returns false if the context stays suspended', ...);
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.

- [ ] **Step 3: Implement `src/audio.ts`** with oscillators, as in the spike:
  - `warning`: two short mid beeps.
  - `roundStart`: rising high tone.
  - `roundEnd`: three long low beeps.

- [ ] **Step 4: Run `npm test`.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/audio* && git commit -m "feat: add ambient audio cues"
```

---

### Task 5: Screens and app wiring

**Files:**
- Create: `src/ui/configScreen.ts`, `src/ui/workoutScreen.ts`, `src/styles.css`
- Modify: `src/main.ts` (replace probe), `index.html`
- Test: `src/ui/configScreen.test.ts`, `src/ui/workoutScreen.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 4.
- Produces:

```ts
export function mountConfigScreen(root: HTMLElement, onStart: (config: Config) => void): void;
export function mountWorkoutScreen(
  root: HTMLElement,
  deps: { config: Config; audio: ReturnType<typeof createAudio>; wakeLock: ReturnType<typeof createWakeLock>; now?: () => number },
  onExit: () => void,
): () => void; // cleanup: clears the interval and listeners, releases wake lock
```

- [ ] **Step 1: Write failing tests with happy-dom and fake timers**

Config screen:
```ts
test('renders loaded values and total', ...); // defaults show 19 min
test('+ and - update value, total and saved config', ...);
test('shows the silent-mode reminder', ...); // text: Desligue o modo silencioso para ouvir os avisos
test('Iniciar calls onStart with current config', ...);
```

Workout screen:
```ts
test('countdown, then round label and "1 de 2"', ...);
test('rest shows DESCANSO and "Próximo: round 2 de 2"', ...);
test('plays each cue at its time', ...);
test('Pausar toggles to Retomar, freezes time and cues', ...);
test('has only Pausar and Parar controls', ...);
test('Parar exits, and no cue plays afterwards', ...);
test('finished state shows Novo treino, and it exits', ...);
test('on return to visible: reacquires wake lock and recovers audio', ...);
test('if recovery fails: shows a tap-to-restore-sound banner and timer keeps running', ...);
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.

- [ ] **Step 3: Implement screens and styles**

- Tick every 200 ms: `session.poll()` to `audio.play`, then render `session.state()`.
- `onStart` in `main.ts` runs `audio.unlock()` and `wakeLock.acquire()` synchronously from the tap, then mounts the workout.
- During the 3 s countdown show the seconds left. `Parar` exits immediately with no confirmation.
- Match `telas-v2` from the spec. The number must fit and fill phone width, using `vw` based sizing and tabular numerals.
- If Task 1 failed its gate: add the fixed reminder `Ajuste Bloqueio Automático para Nunca` to the config screen, with a test.

- [ ] **Step 4: Run `npm test && npm run build`.** Expected: PASS and a clean build.

- [ ] **Step 5: Check at phone width.** Run `npm run dev`, view both screens at 375 px wide. Expected: no horizontal scroll or clipped time at `59:59`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add config and workout screens"
```

---

### Task 6: Release and iPhone acceptance

**Files:**
- Modify: only what acceptance exposes.

- [ ] **Step 1: Push and verify deploy.** `git push`, wait for the workflow, then `curl -I https://<user>.github.io/interval-timer/`. Expected: `200`.

- [ ] **Step 2: User runs acceptance on iPhone,** from the icon with Spotify playing and silent mode off. Use short settings first (2 rounds of 0:30 with 0:15 rest), then a real workout:
  - Complete workout runs without touching the phone.
  - All cues sound at the right time, distinct, with music volume unchanged.
  - Screen stays on throughout (or with Auto-Lock at Never, under plan B).
  - Switch to Spotify mid-round and back: correct phase, no overdue sound, sound still works.
  - In airplane mode, the installed app opens and runs. Reinstall first if an older probe is cached and has not updated.

- [ ] **Step 3: Fix issues with a failing test where logic is involved, then commit and redeploy.**
