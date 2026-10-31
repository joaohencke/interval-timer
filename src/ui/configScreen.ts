import { loadConfig, saveConfig, step } from '../settings';
import { formatTime, totalWorkoutSeconds, type Config } from '../timeline';

const FIELDS: Array<{ key: keyof Config; label: string; ariaName: string }> = [
  { key: 'rounds', label: 'Rounds', ariaName: 'Rounds' },
  { key: 'roundSeconds', label: 'Round', ariaName: 'Tempo de round' },
  { key: 'restSeconds', label: 'Descanso', ariaName: 'Descanso' },
];

function formatTotal(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

export function mountConfigScreen(root: HTMLElement, onStart: (config: Config) => void): void {
  let config = loadConfig();

  root.innerHTML = `
    <main class="screen config">
      <h1>Timer</h1>
      ${FIELDS.map(({ key, label, ariaName }) => `
        <div class="field">
          <span class="field-label">${label}</span>
          <div class="stepper">
            <button type="button" aria-label="Diminuir ${ariaName}" data-key="${key}" data-direction="-1">−</button>
            <output data-value="${key}"></output>
            <button type="button" aria-label="Aumentar ${ariaName}" data-key="${key}" data-direction="1">+</button>
          </div>
        </div>`).join('')}
      <p class="total"></p>
      <p class="reminder">Desligue o modo silencioso para ouvir os avisos</p>
      <button type="button" class="start">Iniciar</button>
    </main>`;

  const render = () => {
    for (const { key } of FIELDS) {
      const output = root.querySelector(`[data-value="${key}"]`)!;
      output.textContent = key === 'rounds' ? String(config[key]) : formatTime(config[key] * 1000);
    }
    root.querySelector('.total')!.textContent = `Total: ${formatTotal(totalWorkoutSeconds(config))}`;
  };

  root.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((button) => {
    button.addEventListener('click', () => {
      const direction = Number(button.dataset.direction) as 1 | -1;
      config = step(config, button.dataset.key as keyof Config, direction);
      saveConfig(config);
      render();
    });
  });
  root.querySelector('.start')!.addEventListener('click', () => onStart(config));

  render();
}
