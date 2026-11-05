// Same-origin AI proxy. Mounted at /api by the Vite plugin (dev/preview) and by server/index.mjs (production).
// Keys are used only to make the upstream call; they are never stored or logged.
import { AIError, STATUS, scrub } from './errors.mjs';
import { callProvider, normalizeConfig } from './providers.mjs';
import { explainPrompt, generatePrompt, reportPrompt, testPrompt } from './prompts.mjs';

const MAX_BODY = 64 * 1024;
const TIMEOUTS = { test: 20000, generate: 45000, explain: 25000, report: 45000 };
const TASKS = { test: testPrompt, generate: generatePrompt, explain: explainPrompt, report: reportPrompt };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new AIError('payload_too_large', '请求体过大。'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new AIError('bad_request', '请求不是有效的 JSON。'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Body access that works both on plain Node (stream) and on Vercel Functions,
 * where the platform may already have parsed the JSON into `req.body`.
 */
async function getBody(req) {
  let pre;
  try {
    pre = req.body;
  } catch {
    throw new AIError('bad_request', '请求不是有效的 JSON。');
  }
  if (pre === undefined || pre === null) return readBody(req);
  let obj = pre;
  if (typeof pre === 'string' || Buffer.isBuffer(pre)) {
    const text = pre.toString('utf8');
    if (Buffer.byteLength(text) > MAX_BODY) throw new AIError('payload_too_large', '请求体过大。');
    try {
      obj = text ? JSON.parse(text) : {};
    } catch {
      throw new AIError('bad_request', '请求不是有效的 JSON。');
    }
  } else if (JSON.stringify(pre).length > MAX_BODY) {
    throw new AIError('payload_too_large', '请求体过大。');
  }
  return obj && typeof obj === 'object' ? obj : {};
}

/** Client IP for rate limiting. Forwarded headers are only trusted behind a known proxy (Vercel). */
function clientIp(req, trustProxy) {
  if (trustProxy) {
    const h = req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for'];
    const first = String(Array.isArray(h) ? h[0] : h || '').split(',')[0].trim();
    if (first) return first;
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  // Never cache API responses anywhere: browser, Vercel edge, or Cloudflare.
  res.setHeader('cache-control', 'no-store, private, max-age=0');
  res.setHeader('cdn-cache-control', 'no-store');
  res.setHeader('cloudflare-cdn-cache-control', 'no-store');
  res.setHeader('vercel-cdn-cache-control', 'no-store');
  res.setHeader('pragma', 'no-cache');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(obj));
}

/** Simple fixed-window limiter per client IP. */
function makeLimiter(perMinute) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const w = hits.get(key);
    if (!w || now - w.start > 60_000) {
      hits.set(key, { start: now, n: 1 });
      if (hits.size > 5000) hits.clear();
      return true;
    }
    w.n++;
    return w.n <= perMinute;
  };
}

export function serverManagedConfig(env) {
  if (!env.AI_API_KEY && !(env.AI_PROVIDER === 'openai-compatible' && env.AI_BASE_URL)) return null;
  return { provider: env.AI_PROVIDER || 'openai', model: env.AI_MODEL || '', apiKey: env.AI_API_KEY || '', baseUrl: env.AI_BASE_URL };
}

/**
 * @param {{env?: Record<string,string|undefined>, call?: typeof callProvider}} [opts]
 * @returns {(req, res, next?) => void}
 */
export function createAIHandler({ env = process.env, call = callProvider } = {}) {
  const allowPrivate = env.LEXIMASTER_ALLOW_PRIVATE_BASE_URL === '1';
  const managed = serverManagedConfig(env);
  const limit = makeLimiter(Number(env.LEXIMASTER_AI_RATE_LIMIT || 60));
  const trustProxy = env.VERCEL === '1' || env.LEXIMASTER_TRUST_PROXY === '1';

  return async function aiHandler(req, res, next) {
    const url = (req.originalUrl || req.url || '').split('?')[0];
    if (!url.startsWith('/api/')) return next ? next() : send(res, 404, { error: { code: 'not_found', message: 'Not found' } });

    if (url === '/api/health' && req.method === 'GET') {
      return send(res, 200, {
        ok: true,
        service: 'leximaster-ai-proxy',
        serverManaged: managed ? { provider: managed.provider, model: managed.model } : null,
        allowPrivateBaseUrl: allowPrivate,
        runtime: env.VERCEL === '1' ? 'vercel' : 'node',
      });
    }

    const m = url.match(/^\/api\/ai\/(test|generate|explain|report)$/);
    if (!m) return send(res, 404, { error: { code: 'not_found', message: '未知接口' } });
    if (req.method !== 'POST') return send(res, 405, { error: { code: 'method_not_allowed', message: '仅支持 POST' } });
    // Only same-origin JSON requests (blocks simple cross-site form posts).
    if (!String(req.headers['content-type'] || '').includes('application/json')) {
      return send(res, 415, { error: { code: 'bad_request', message: '需要 application/json' } });
    }
    const ip = clientIp(req, trustProxy);
    if (!limit(ip)) return send(res, 429, { error: { code: 'proxy_rate_limited', message: '请求过于频繁，请稍后再试。', retryAfter: 30 } });

    const task = m[1];
    let secrets = [];
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      const body = await getBody(req);
      let cfg;
      if (body?.config?.useServerKey) {
        if (!managed) throw new AIError('not_configured', '服务端未配置托管密钥。');
        cfg = normalizeConfig({ ...managed, model: body.config.model || managed.model }, { allowPrivate });
      } else {
        cfg = normalizeConfig(body?.config, { allowPrivate });
      }
      secrets = [cfg.apiKey];
      const prompt = TASKS[task](body?.payload);
      const out = await call(cfg, { ...prompt, json: true }, { timeoutMs: TIMEOUTS[task], signal: controller.signal, allowPrivate });
      send(res, 200, { content: out.text, truncated: !!out.truncated, usage: out.usage, latencyMs: out.latencyMs, model: cfg.model, provider: cfg.provider });
    } catch (e) {
      const code = e instanceof AIError ? e.code : 'upstream_error';
      if (code === 'cancelled') return; // client went away
      const message = scrub(e instanceof AIError ? e.message : '代理内部错误。', secrets);
      if (!(e instanceof AIError)) console.error('[ai-proxy]', scrub(e?.stack || e, secrets));
      send(res, STATUS[code] || 500, { error: { code, message, ...(e?.retryAfter !== undefined ? { retryAfter: e.retryAfter } : {}) } });
    }
  };
}
