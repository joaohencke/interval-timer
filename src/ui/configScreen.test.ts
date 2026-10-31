import { mountConfigScreen } from './configScreen';

let root: HTMLElement;
const button = (label: string) => root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const text = () => root.textContent ?? '';

beforeEach(() => {
  localStorage.clear();
  root = document.createElement('div');
});

test('renders defaults and total', () => {
  mountConfigScreen(root, () => {});
  expect(root.querySelector('[data-value="rounds"]')!.textContent).toBe('5');
  expect(root.querySelector('[data-value="roundSeconds"]')!.textContent).toBe('3:00');
  expect(root.querySelector('[data-value="restSeconds"]')!.textContent).toBe('1:00');
  expect(text()).toContain('Total: 19 min');
});

test('+ and - update value, total and saved config', () => {
  mountConfigScreen(root, () => {});
  button('Aumentar Rounds').click();
  expect(root.querySelector('[data-value="rounds"]')!.textContent).toBe('6');
  expect(text()).toContain('Total: 23 min');
  button('Diminuir Descanso').click();
  expect(root.querySelector('[data-value="restSeconds"]')!.textContent).toBe('0:45');
  expect(text()).toContain('Total: 21 min 45 s');

  const remounted = document.createElement('div');
  mountConfigScreen(remounted, () => {});
  expect(remounted.querySelector('[data-value="rounds"]')!.textContent).toBe('6');
  expect(remounted.querySelector('[data-value="restSeconds"]')!.textContent).toBe('0:45');
});

test('shows the silent-mode reminder', () => {
  mountConfigScreen(root, () => {});
  expect(text()).toContain('Desligue o modo silencioso para ouvir os avisos');
});

test('Iniciar calls onStart with current config', () => {
  const onStart = vi.fn();
  mountConfigScreen(root, onStart);
  button('Aumentar Tempo de round').click();
  root.querySelector<HTMLButtonElement>('.start')!.click();
  expect(onStart).toHaveBeenCalledWith({ rounds: 5, roundSeconds: 195, restSeconds: 60 });
});
