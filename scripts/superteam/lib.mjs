// Shared helpers for the Superteam Earn agent pipeline.
// API contract verified against the open-source app (SuperteamDAO/earn @ main,
// public/skill.md v0.5.1 + src/pages/api/agents/*) on 2026-08-21.
//
// Base URL: the Earn app serves pages under superteam.fun/earn and its API under
// superteam.fun/api/* (skill.md: claim page is `BASE_URL/earn/claim/<code>`,
// register is `POST $BASE_URL/api/agents`).
// TODO-VERIFY: legacy domain earn.superteam.fun redirects to superteam.fun/earn;
// if superteam.fun ever moves the API, override with SUPERTEAM_BASE_URL.

import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE_URL = (
  process.env.SUPERTEAM_BASE_URL || 'https://superteam.fun'
).replace(/\/+$/, '');

export const API_KEY = process.env.SUPERTEAM_API_KEY || '';

export const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'out');

export async function ensureOutDir() {
  await mkdir(OUT_DIR, { recursive: true });
  return OUT_DIR;
}

/**
 * fetch JSON with a timeout and useful error messages.
 * @returns {Promise<{ok: true, status: number, data: any} | {ok: false, status: number|null, error: string}>}
 */
export async function fetchJson(url, { method = 'GET', headers = {}, body, timeoutMs = 30_000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        accept: 'application/json',
        'user-agent': 'sellSomething-superteam-scout/0.1 (+https://agentready.agiscorecard.com)',
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 500) };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status} ${res.statusText}: ${JSON.stringify(data).slice(0, 300)}` };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, status: null, error: `${err.name === 'AbortError' ? 'timeout' : 'network error'}: ${err.message}` };
  } finally {
    clearTimeout(timer);
  }
}

export function authHeaders() {
  return API_KEY ? { authorization: `Bearer ${API_KEY}` } : {};
}

export function daysUntil(isoDate) {
  if (!isoDate) return null;
  const t = Date.parse(isoDate);
  if (Number.isNaN(t)) return null;
  return (t - Date.now()) / 86_400_000;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
