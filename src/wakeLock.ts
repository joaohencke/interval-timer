export type WakeLock = {
  acquire(): Promise<void>;
  release(): Promise<void>;
  isActive(): boolean;
};

export function createWakeLock(nav: Navigator = navigator): WakeLock {
  let sentinel: WakeLockSentinel | null = null;

  return {
    async acquire() {
      if (!('wakeLock' in nav) || (sentinel && !sentinel.released)) return;
      try {
        const next = await nav.wakeLock.request('screen');
        next.addEventListener('release', () => {
          if (sentinel === next) sentinel = null;
        });
        sentinel = next;
      } catch {
        // The browser can refuse, for example on low battery. The timer keeps working.
        sentinel = null;
      }
    },
    async release() {
      const current = sentinel;
      sentinel = null;
      await current?.release();
    },
    isActive() {
      return sentinel !== null;
    },
  };
}
