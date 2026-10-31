// Temporary probe for the Wake Lock gate. Task 5 replaces this file.
import { createWakeLock } from './wakeLock';

const root = document.querySelector<HTMLElement>('#app')!;
root.style.cssText = 'padding:24px;font:18px -apple-system,system-ui,sans-serif;line-height:1.7';
root.innerHTML = `
  <h1 style="font-size:24px">Teste de tela ligada</h1>
  <p id="status"></p>
  <button id="start" style="width:100%;padding:18px;font-size:20px;border:0;border-radius:12px;background:#1f9d4d;color:#fff">Iniciar teste</button>
`;

const lock = createWakeLock();
const statusEl = root.querySelector<HTMLElement>('#status')!;
let startedAt = 0;
let ctx: AudioContext | null = null;

function render() {
  const installed =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    matchMedia('(display-mode: standalone)').matches;
  const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  statusEl.innerHTML = [
    `Instalado: <b>${installed ? 'sim' : 'não'}</b>`,
    `HTTPS: <b>${isSecureContext ? 'sim' : 'não'}</b>`,
    `Tela ligada ativa: <b>${lock.isActive() ? 'sim' : 'não'}</b>`,
    `Tempo: <b>${elapsed}s</b>`,
  ].join('<br>');
}

function beep() {
  if (!ctx) return;
  const t = ctx.currentTime + 0.02;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.8, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.42);
}

root.querySelector('#start')!.addEventListener('click', async () => {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = 'ambient';
  ctx ??= new AudioContext();
  void ctx.resume();
  await lock.acquire();
  startedAt ||= Date.now();
  beep();
  setInterval(beep, 5000);
  render();
}, { once: true });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && startedAt) {
    void ctx?.resume();
    void lock.acquire().then(render);
  }
});

setInterval(render, 1000);
render();
