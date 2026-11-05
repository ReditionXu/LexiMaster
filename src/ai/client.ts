import { budgetLeft, getSettings, isConfigured, recordUsage, requestConfig } from './settings';

export type AITask = 'test' | 'generate' | 'explain' | 'report';

export class AIError extends Error {
  code: string;
  retryAfter?: number;
  constructor(code: string, message: string, retryAfter?: number) {
    super(message);
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export const FRIENDLY: Record<string, string> = {
  not_configured: 'AI 尚未配置。',
  disabled: 'AI 功能已关闭。',
  budget_exceeded: '今日 AI 请求次数已达上限，可在「AI 设置」中调整。',
  auth_failed: 'API Key 无效或没有权限。',
  model_not_found: '模型名称不正确，或该账号无权使用此模型。',
  rate_limited: '服务商限流或额度不足，请稍后再试。',
  proxy_rate_limited: '请求过于频繁，请稍后再试。',
  timeout: '请求超时。',
  network: '无法连接到 AI 服务。',
  offline: '无法连接到本地 AI 代理（/api）。如果是静态部署（如 GitHub Pages），AI 功能不可用。',
  cancelled: '请求已取消。',
  invalid_output: 'AI 返回的内容未通过校验。',
};

const TIMEOUT: Record<AITask, number> = { test: 25000, generate: 50000, explain: 30000, report: 50000 };

export interface AIResponse {
  content: string;
  truncated?: boolean;
  latencyMs?: number;
  model?: string;
  usage?: { input?: number; output?: number };
}

/**
 * Call the same-origin proxy. Never retries on its own — callers decide (with a cap),
 * so an outage can never silently burn the user's quota.
 */
export async function aiRequest(task: AITask, payload: unknown, opts: { signal?: AbortSignal; skipBudget?: boolean } = {}): Promise<AIResponse> {
  const s = getSettings();
  if (!isConfigured(s)) throw new AIError('not_configured', FRIENDLY.not_configured);
  if (task !== 'test' && !s.enabled) throw new AIError('disabled', FRIENDLY.disabled);
  if (!opts.skipBudget && budgetLeft() <= 0) throw new AIError('budget_exceeded', FRIENDLY.budget_exceeded);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), TIMEOUT[task]);
  const onAbort = () => ctrl.abort(opts.signal?.reason);
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  if (opts.signal?.aborted) ctrl.abort();

  recordUsage();
  try {
    let res: Response;
    try {
      res = await fetch(`/api/ai/${task}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config: requestConfig(), payload }),
        signal: ctrl.signal,
        credentials: 'same-origin',
      });
    } catch (e) {
      if (opts.signal?.aborted) throw new AIError('cancelled', FRIENDLY.cancelled);
      if (ctrl.signal.aborted) throw new AIError('timeout', FRIENDLY.timeout);
      throw new AIError('offline', FRIENDLY.offline);
    }
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      if (res.status === 404) throw new AIError('offline', FRIENDLY.offline);
      throw new AIError('network', `AI 代理返回了无效响应（HTTP ${res.status}）。`);
    }
    if (!res.ok) {
      const code = body?.error?.code || 'network';
      throw new AIError(code, body?.error?.message || FRIENDLY[code] || '请求失败。', body?.error?.retryAfter);
    }
    return body as AIResponse;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

export async function checkProxy(): Promise<{ ok: boolean; serverManaged: { provider: string; model: string } | null }> {
  try {
    const r = await fetch('/api/health');
    if (!r.ok) return { ok: false, serverManaged: null };
    const j = await r.json();
    return { ok: !!j.ok, serverManaged: j.serverManaged ?? null };
  } catch {
    return { ok: false, serverManaged: null };
  }
}

/** Pull the first JSON object out of model text (tolerates ```json fences and chatter). */
export function extractJSON(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch {}
  const start = t.indexOf('{');
  if (start < 0) throw new AIError('invalid_output', 'AI 没有返回 JSON。');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(t.slice(start, i + 1));
      } catch {
        break;
      }
    }
  }
  throw new AIError('invalid_output', 'AI 返回的 JSON 无法解析。');
}
