import type { Config } from './timeline';

const STORAGE_KEY = 'interval-timer:config';

export const DEFAULTS: Config = { rounds: 5, roundSeconds: 180, restSeconds: 60 };

export const LIMITS = {
  rounds: { min: 1, max: 99, step: 1 },
  roundSeconds: { min: 15, max: 3600, step: 15 },
  restSeconds: { min: 15, max: 3600, step: 15 },
} as const;

function normalize(key: keyof Config, value: number): number {
  const { min, max, step: size } = LIMITS[key];
  const snapped = Math.round(value / size) * size;
  return Math.min(max, Math.max(min, snapped));
}

function field(saved: Record<string, unknown>, key: keyof Config): number {
  const value = saved[key];
  return typeof value === 'number' && Number.isFinite(value) ? normalize(key, value) : DEFAULTS[key];
}

export function step(config: Config, key: keyof Config, direction: 1 | -1): Config {
  return { ...config, [key]: normalize(key, config[key] + direction * LIMITS[key].step) };
}

function defaultStorage(): Storage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

export function loadConfig(storage: Storage | undefined = defaultStorage()): Config {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    if (typeof saved !== 'object' || saved === null) return { ...DEFAULTS };
    const record = saved as Record<string, unknown>;
    return {
      rounds: field(record, 'rounds'),
      roundSeconds: field(record, 'roundSeconds'),
      restSeconds: field(record, 'restSeconds'),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(config: Config, storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Saving is a convenience. The workout works without it.
  }
}
