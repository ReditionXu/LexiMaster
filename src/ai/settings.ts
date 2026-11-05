import { useSyncExternalStore } from 'react';

/**
 * AI settings store.
 *
 * Non-secret preferences (provider, model, base URL, toggles, budget) are kept in
 * localStorage. The API key is NOT persisted by default: it lives only in memory and
 * is gone after a refresh. The user may opt in to keeping it for the current browser
 * tab (sessionStorage — cleared when the tab closes). Cross-session storage would need
 * authentication + server-side encryption, which this offline app deliberately avoids;
 * deployers can instead configure a server-managed key (see docs/AI.md).
 */

export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'openai-compatible';

export const PROVIDER_META: Record<AIProvider, { name: string; keyHint: string; modelExamples: string[]; docs: string }> = {
  openai: { name: 'OpenAI', keyHint: 'sk-…', modelExamples: ['gpt-4o-mini', 'gpt-4.1-mini'], docs: 'https://platform.openai.com/api-keys' },
  anthropic: { name: 'Anthropic Claude', keyHint: 'sk-ant-…', modelExamples: ['claude-sonnet-4-5', 'claude-haiku-4-5'], docs: 'https://console.anthropic.com/settings/keys' },
  gemini: { name: 'Google Gemini', keyHint: 'AIza…', modelExamples: ['gemini-2.5-flash', 'gemini-2.5-pro'], docs: 'https://aistudio.google.com/apikey' },
  'openai-compatible': { name: 'OpenAI 兼容接口', keyHint: '可选', modelExamples: ['deepseek-chat', 'qwen-plus'], docs: '' },
};

export interface AISettings {
  enabled: boolean;
  provider: AIProvider;
  model: string;
  baseUrl: string;
  /** Use the key configured on the server (AI_API_KEY) instead of a personal key. */
  useServerKey: boolean;
  features: { generate: boolean; explain: boolean; report: boolean };
  /** When to request AI explanations after an answer. */
  explainMode: 'wrong-only' | 'always' | 'manual';
  /** Hard cap on AI requests per calendar day (client-side budget). */
  dailyLimit: number;
  /** Questions generated per request (batch size) when prefetching. */
  batchSize: number;
  rememberKeyForTab: boolean;
  lastTest?: { ok: boolean; at: number; message: string; latencyMs?: number; signature: string };
}

export const DEFAULT_SETTINGS: AISettings = {
  enabled: false,
  provider: 'openai',
  model: '',
  baseUrl: '',
  useServerKey: false,
  features: { generate: true, explain: true, report: true },
  explainMode: 'wrong-only',
  dailyLimit: 150,
  batchSize: 3,
  rememberKeyForTab: false,
};

const SETTINGS_KEY = 'leximaster_ai_settings_v1';
const TAB_KEY = 'leximaster_ai_key_tab';
const USAGE_KEY = 'leximaster_ai_usage_v1';

let settings: AISettings = load();
let apiKey: string = loadTabKey();
const listeners = new Set<() => void>();
let snapshot = { settings, hasKey: !!apiKey, usage: readUsage() };

function load(): AISettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    // Defensive: never accept a key from persisted settings.
    delete parsed.apiKey;
    return { ...DEFAULT_SETTINGS, ...parsed, features: { ...DEFAULT_SETTINGS.features, ...(parsed.features || {}) } };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
function loadTabKey(): string {
  try {
    return sessionStorage.getItem(TAB_KEY) || '';
  } catch {
    return '';
  }
}
function emit() {
  snapshot = { settings, hasKey: !!apiKey, usage: readUsage() };
  listeners.forEach((l) => l());
}

export function getSettings() {
  return settings;
}
export function updateSettings(patch: Partial<AISettings>) {
  settings = { ...settings, ...patch };
  try {
    const { lastTest, ...rest } = settings;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...rest, lastTest }));
  } catch {}
  if (patch.rememberKeyForTab === false) {
    try {
      sessionStorage.removeItem(TAB_KEY);
    } catch {}
  } else if (patch.rememberKeyForTab === true && apiKey) {
    try {
      sessionStorage.setItem(TAB_KEY, apiKey);
    } catch {}
  }
  emit();
}

export function setApiKey(key: string) {
  apiKey = key.trim();
  try {
    if (settings.rememberKeyForTab && apiKey) sessionStorage.setItem(TAB_KEY, apiKey);
    else sessionStorage.removeItem(TAB_KEY);
  } catch {}
  emit();
}
export function getApiKey() {
  return apiKey;
}

/** Remove the configuration entirely (key, settings, cached test result). */
export function deleteConfiguration() {
  apiKey = '';
  try {
    sessionStorage.removeItem(TAB_KEY);
    localStorage.removeItem(SETTINGS_KEY);
  } catch {}
  settings = { ...DEFAULT_SETTINGS };
  emit();
}

/** Stable signature of the connection-relevant fields, to know if a past test still applies. */
export function connectionSignature(s: AISettings = settings) {
  return [s.provider, s.model.trim(), s.provider === 'openai-compatible' ? s.baseUrl.trim() : '', s.useServerKey ? 'server' : 'byok'].join('|');
}

export function isConfigured(s: AISettings = settings) {
  if (!s.model.trim() && !s.useServerKey) return false;
  if (s.useServerKey) return true;
  if (s.provider === 'openai-compatible') return !!s.baseUrl.trim();
  return !!apiKey;
}

export function aiReady(feature: keyof AISettings['features'], s: AISettings = settings) {
  return s.enabled && s.features[feature] && isConfigured(s);
}

/* ----------------------------------------------------------------- usage */
function today() {
  return new Date().toISOString().slice(0, 10);
}
export function readUsage(): { date: string; count: number } {
  try {
    const u = JSON.parse(localStorage.getItem(USAGE_KEY) || 'null');
    if (u && u.date === today()) return u;
  } catch {}
  return { date: today(), count: 0 };
}
export function recordUsage() {
  const u = readUsage();
  const next = { date: u.date, count: u.count + 1 };
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(next));
  } catch {}
  emit();
  return next;
}
export function budgetLeft() {
  return Math.max(0, settings.dailyLimit - readUsage().count);
}

/* ------------------------------------------------------------------ hook */
export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useAISettings() {
  return useSyncExternalStore(subscribe, () => snapshot);
}

/** Config sent to the proxy with each request. */
export function requestConfig() {
  return {
    provider: settings.provider,
    model: settings.model.trim(),
    baseUrl: settings.provider === 'openai-compatible' ? settings.baseUrl.trim() : undefined,
    apiKey: settings.useServerKey ? undefined : apiKey || undefined,
    useServerKey: settings.useServerKey || undefined,
  };
}
