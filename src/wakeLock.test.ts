import { createWakeLock } from './wakeLock';

function fakeNavigator() {
  const listeners: Array<() => void> = [];
  const sentinel = {
    released: false,
    release: vi.fn(async () => {
      sentinel.released = true;
      listeners.forEach((l) => l());
    }),
    addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
  };
  const request = vi.fn(async () => sentinel);
  return { nav: { wakeLock: { request } } as unknown as Navigator, sentinel, request };
}

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

test('acquire requests a screen lock and becomes active', async () => {
  const { nav, request } = fakeNavigator();
  const lock = createWakeLock(nav);
  await lock.acquire();
  expect(request).toHaveBeenCalledWith('screen');
  expect(lock.isActive()).toBe(true);
});

test('isActive goes false after the sentinel releases', async () => {
  const { nav, sentinel } = fakeNavigator();
  const lock = createWakeLock(nav);
  await lock.acquire();
  await sentinel.release();
  expect(lock.isActive()).toBe(false);
});

test('release frees the held lock', async () => {
  const { nav, sentinel } = fakeNavigator();
  const lock = createWakeLock(nav);
  await lock.acquire();
  await lock.release();
  expect(sentinel.release).toHaveBeenCalledOnce();
  expect(lock.isActive()).toBe(false);
});
