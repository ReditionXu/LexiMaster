// Provider adapters: one place that knows each vendor's wire format.
import { AIError, scrub } from './errors.mjs';
import { guardedRequest, validateBaseUrl } from './safeFetch.mjs';

export const PROVIDERS = ['openai', 'anthropic', 'gemini', 'openai-compatible'];
const MODEL_RE = /^[A-Za-z0-9._:/@+-]{1,128}$/;

/** Validate + normalise a config coming from the browser (or env). */
export function normalizeConfig(cfg, { allowPrivate = false } = {}) {
  if (!cfg || typeof cfg !== 'object') throw new AIError('invalid_config', '缺少 AI 配置。');
  const provider = String(cfg.provider || '');
  if (!PROVIDERS.includes(provider)) throw new AIError('invalid_config', `不支持的服务商：${provider || '（空）'}`);
  const model = String(cfg.model || '').trim();
  if (!MODEL_RE.test(model)) throw new AIError('invalid_config', '模型名称（Model ID）无效。');
  const apiKey = typeof cfg.apiKey === 'string' ? cfg.apiKey.trim() : '';
  if (provider !== 'openai-compatible' && !apiKey) throw new AIError('invalid_config', '缺少 API Key。');
  if (apiKey.length > 512 || /\s/.test(apiKey)) throw new AIError('invalid_config', 'API Key 格式不正确。');
  let baseUrl;
  if (provider === 'openai-compatible') {
    if (!cfg.baseUrl) throw new AIError('invalid_config', 'OpenAI 兼容接口需要填写 Base URL。');
    baseUrl = validateBaseUrl(String(cfg.baseUrl), { allowPrivate });
  }
  return { provider, model, apiKey, baseUrl };
}

function retryAfterSeconds(headers) {
  const v = headers?.['retry-after'];
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0) return Math.min(n, 120);
  const d = Date.parse(v);
  if (!Number.isNaN(d)) return Math.max(0, Math.min(120, Math.round((d - Date.now()) / 1000)));
  return undefined;
}

function upstreamError(status, text, headers, secrets) {
  let msg = '';
  try {
    const j = JSON.parse(text);
    msg = j?.error?.message || j?.error?.status || j?.message || '';
  } catch {
    msg = text.slice(0, 200);
  }
  msg = scrub(msg, secrets);
  if (status === 401 || status === 403) return new AIError('auth_failed', `认证失败：API Key 无效或无权限。${msg ? '（' + msg + '）' : ''}`);
  if (status === 404) return new AIError('model_not_found', `模型不存在或接口地址错误。${msg ? '（' + msg + '）' : ''}`);
  if (status === 429) return new AIError('rate_limited', `请求过于频繁或额度不足。${msg ? '（' + msg + '）' : ''}`, { retryAfter: retryAfterSeconds(headers) });
  if (status === 400 || status === 422) return new AIError('bad_request', `服务商拒绝了请求：${msg || status}`);
  return new AIError('upstream_error', `服务商暂时不可用（HTTP ${status}）。${msg ? '（' + msg + '）' : ''}`);
}

/**
 * Build the vendor-specific HTTP request.
 * @param {{provider:string, model:string, apiKey:string, baseUrl?:string}} cfg
 * @param {{system:string, user:string, maxTokens:number, json:boolean}} msg
 */
export function buildRequest(cfg, { system, user, maxTokens = 1200, json = true }) {
  switch (cfg.provider) {
    case 'openai':
      return {
        url: 'https://api.openai.com/v1/chat/completions',
        headers: { authorization: `Bearer ${cfg.apiKey}` },
        body: {
          model: cfg.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          max_completion_tokens: maxTokens,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        },
      };
    case 'openai-compatible': {
      const base = cfg.baseUrl.replace(/\/chat\/completions$/, '');
      return {
        url: `${base}/chat/completions`,
        headers: cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {},
        // Many compatible servers reject response_format; rely on the prompt + client-side JSON extraction.
        body: {
          model: cfg.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          max_tokens: maxTokens,
          temperature: 0.7,
          stream: false,
        },
      };
    }
    case 'anthropic':
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
        body: { model: cfg.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] },
      };
    case 'gemini':
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`,
        headers: { 'x-goog-api-key': cfg.apiKey },
        body: {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { maxOutputTokens: maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
        },
      };
    default:
      throw new AIError('invalid_config', '不支持的服务商');
  }
}

/** Extract assistant text (+usage) from each vendor's response JSON. */
export function parseResponse(provider, data) {
  if (provider === 'anthropic') {
    const text = (data?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { text, usage: data?.usage ? { input: data.usage.input_tokens, output: data.usage.output_tokens } : undefined, truncated: data?.stop_reason === 'max_tokens' };
  }
  if (provider === 'gemini') {
    if (data?.promptFeedback?.blockReason) throw new AIError('safety_blocked', `内容被服务商安全策略拦截：${data.promptFeedback.blockReason}`);
    const cand = data?.candidates?.[0];
    const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
    if (!text && cand?.finishReason === 'SAFETY') throw new AIError('safety_blocked', '内容被服务商安全策略拦截。');
    const u = data?.usageMetadata;
    return { text, usage: u ? { input: u.promptTokenCount, output: u.candidatesTokenCount } : undefined, truncated: cand?.finishReason === 'MAX_TOKENS' };
  }
  const choice = data?.choices?.[0];
  const text = choice?.message?.content ?? '';
  const u = data?.usage;
  return { text: typeof text === 'string' ? text : '', usage: u ? { input: u.prompt_tokens, output: u.completion_tokens } : undefined, truncated: choice?.finish_reason === 'length' };
}

/** Call the provider. `request` is injectable for tests. */
export async function callProvider(cfg, msg, { timeoutMs = 30000, signal, allowPrivate = false, request = guardedRequest } = {}) {
  const r = buildRequest(cfg, msg);
  const started = Date.now();
  const res = await request(r.url, { headers: r.headers, body: r.body, timeoutMs, signal, allowPrivate });
  if (res.status < 200 || res.status >= 300) throw upstreamError(res.status, res.text, res.headers, [cfg.apiKey]);
  let data;
  try {
    data = JSON.parse(res.text);
  } catch {
    throw new AIError('upstream_error', '服务商返回了无法解析的响应。');
  }
  const out = parseResponse(cfg.provider, data);
  if (!out.text || !out.text.trim()) throw new AIError('empty_response', 'AI 返回了空内容。');
  return { ...out, latencyMs: Date.now() - started };
}
