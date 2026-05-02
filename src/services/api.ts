import type { RegistryEntry, PickupLog, SystemSettings } from '../types';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  registry: {
    get: () => apiFetch<RegistryEntry[]>('/api/registry'),
    save: (data: RegistryEntry[]) =>
      apiFetch<{ success: boolean }>('/api/registry', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  settings: {
    get: () => apiFetch<SystemSettings>('/api/settings'),
    save: (data: SystemSettings) =>
      apiFetch<{ success: boolean }>('/api/settings', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  history: {
    get: () => apiFetch<PickupLog[]>('/api/history'),
    save: (data: PickupLog[]) =>
      apiFetch<{ success: boolean }>('/api/history', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  health: {
    check: () => apiFetch<{ status: string; uptime: number }>('/api/health'),
  },
};
