import type { Audio } from '../audio';
import { createSession } from '../session';
import { formatTime, type Config, type PhaseState } from '../timeline';
import type { WakeLock } from '../wakeLock';

const TICK_MS = 200;
const RETRY_MS = 3000;

type Deps = {
  config: Config;
  audio: Pick<Audio, 'play' | 'recover' | 'isRunning'>;
  wakeLock: Pick<WakeLock, 'acquire' | 'release' | 'isActive'>;
  now?: () => number;
};

function view(state: PhaseState, rounds: number) {
  switch (state.phase) {
    case 'countdown':
      return {
        label: 'PREPARE',
        detail: `Round 1 de ${rounds}`,
        time: String(Math.ceil(state.remainingMs / 1000)),
      };
    case 'round':
      return { label: 'ROUND', detail: `${state.round} de ${rounds}`, time: formatTime(state.remainingMs) };
    case 'rest':
      return {
        label: 'DESCANSO',
        detail: `Próximo: round ${state.round + 1} de ${rounds}`,
        time: formatTime(state.remainingMs),
      };
    case 'finished':
      return { label: 'FIM', detail: 'Treino concluído', time: '0:00' };
  }
}

export function mountWorkoutScreen(root: HTMLElement, deps: Deps, onExit: () => void): () => void {
  const { config, audio, wakeLock, now = Date.now } = deps;
  const session = createSession(config, now);

  root.innerHTML = `
    <main class="screen workout">
      <div class="sound-banner" role="button" tabindex="0" hidden>Som pausado. Toque para reativar.</div>
      <div class="phase"></div>
      <div class="detail"></div>
      <div class="time"></div>
      <div class="controls"></div>
    </main>`;

  const phaseEl = root.querySelector<HTMLElement>('.phase')!;
  const detailEl = root.querySelector<HTMLElement>('.detail')!;
  const timeEl = root.querySelector<HTMLElement>('.time')!;
  const controlsEl = root.querySelector<HTMLElement>('.controls')!;
  const bannerEl = root.querySelector<HTMLElement>('.sound-banner')!;

  let interval: ReturnType<typeof setInterval> | undefined;
  let done = false;
  let recovering = false;
  let lastSoundRetry = now();
  let lastLockRetry = now();

  const cleanup = () => {
    if (done) return;
    done = true;
    clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisibility);
    void wakeLock.release();
  };

  const exit = () => {
    cleanup();
    onExit();
  };

  const button = (label: string, onClick: () => void) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.addEventListener('click', onClick);
    return el;
  };

  const renderControls = (finished: boolean) => {
    controlsEl.replaceChildren(
      ...(finished
        ? [button('Novo treino', exit)]
        : [
            button(session.isPaused() ? 'Retomar' : 'Pausar', () => {
              if (session.isPaused()) session.resume();
              else session.pause();
              renderControls(false);
            }),
            button('Parar', exit),
          ]),
    );
  };

  const finish = () => {
    clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisibility);
    bannerEl.hidden = true;
    void wakeLock.release();
    renderControls(true);
  };

  const tick = () => {
    for (const cue of session.poll()) audio.play(cue);
    const state = session.state();
    const { label, detail, time } = view(state, config.rounds);
    phaseEl.textContent = label;
    phaseEl.className = `phase ${state.phase}`;
    detailEl.textContent = detail;
    timeEl.textContent = time;
    timeEl.classList.toggle('count', state.phase === 'countdown');
    if (state.phase === 'finished') finish();
    else keepAlive();
    return state;
  };

  const restoreSound = async () => {
    recovering = true;
    lastSoundRetry = now();
    const running = await audio.recover();
    recovering = false;
    bannerEl.hidden = running;
  };

  // Calls, Siri and alarms can drop audio or the wake lock with no visibility change.
  function keepAlive() {
    if (document.visibilityState !== 'visible') return;
    if (audio.isRunning()) {
      bannerEl.hidden = true;
    } else if (!recovering && now() - lastSoundRetry >= RETRY_MS) {
      void restoreSound();
    }
    if (!wakeLock.isActive() && now() - lastLockRetry >= RETRY_MS) {
      lastLockRetry = now();
      void wakeLock.acquire();
    }
  }

  function onVisibility() {
    if (document.visibilityState !== 'visible') return;
    if (tick().phase === 'finished') return;
    lastLockRetry = now();
    void wakeLock.acquire();
    if (!recovering) void restoreSound();
  }

  bannerEl.addEventListener('click', () => void restoreSound());
  document.addEventListener('visibilitychange', onVisibility);

  session.start();
  renderControls(false);
  tick();
  interval = setInterval(tick, TICK_MS);

  return cleanup;
}
