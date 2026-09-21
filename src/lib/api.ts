"use client";

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `Erro ${res.status}`);
  }
  return json.data as T;
}

export function newIdem(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function moneyToCentsInput(value: string): number {
  // "1.234,56" -> cents
  if (!value) return 0;
  let s = value.trim().replace(/[^\d.,-]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
