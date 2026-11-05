import { describe, expect, it } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import { createAIHandler } from '../server/ai/handler.mjs';
import { guardedRequest } from '../server/ai/safeFetch.mjs';
import aiTask from '../api/ai/[task].js';
import health from '../api/health.js';

/** Start a server that mimics Vercel's Node runtime: JSON body pre-parsed onto req.body. */
async function vercelLike(fn, { preParse = true } = {}) {
  const srv = http.createServer(async (req, res) => {
    if (preParse && req.method === 'POST') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const text = Buffer.concat(chunks).toString();
      Object.defineProperty(req, 'body', { value: text ? JSON.parse(text) : undefined, configurable: true });
    }
    fn(req, res);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}
const post = (base, path, body, headers = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json() }));

describe('Vercel Functions', () => {
  it('api/health.js responds with JSON (not the SPA index.html)', async () => {
    const s = await vercelLike(health);
    const r = await fetch(s.url + '/api/health');
    expect(r.headers.get('content-type')).toContain('application/json');
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.service).toBe('leximaster-ai-proxy');
    s.close();
  });

  it('api/ai/[task].js works when the platform has already parsed req.body', async () => {
    const s = await vercelLike(aiTask);
    // invalid config → proves the body was read and validated by the real handler
    const r = await post(s.url, '/api/ai/test', { config: { provider: 'nope' } });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('invalid_config');
    const r2 = await post(s.url, '/api/ai/test', { config: { provider: 'openai-compatible', model: 'm', baseUrl: 'https://169.254.169.254/v1' } });
    expect(r2.json.error.code).toBe('blocked_address');
    s.close();
  });

  it('keeps every user\'s key separate under concurrent requests (stateless proxy)', async () => {
    const seen = [];
    const call = async (cfg) => {
      seen.push(cfg.apiKey);
      await new Promise((r) => setTimeout(r, 30 + Math.random() * 40));
      return { text: JSON.stringify({ ok: true, keyTail: cfg.apiKey.slice(-4) }), latencyMs: 1 };
    };
    const s = await vercelLike(createAIHandler({ env: { VERCEL: '1' }, call }));
    const users = Array.from({ length: 12 }, (_, i) => `sk-user-${String(i).padStart(4, '0')}`);
    const results = await Promise.all(
      users.map((k, i) => post(s.url, '/api/ai/test', { config: { provider: i % 2 ? 'anthropic' : 'openai', model: 'm', apiKey: k } }, { 'x-forwarded-for': `203.0.113.${i}` }))
    );
    results.forEach((r, i) => expect(JSON.parse(r.json.content).keyTail).toBe(users[i].slice(-4)));
    expect(new Set(seen).size).toBe(users.length);
    // the key is never echoed back in any response field other than our mock content
    results.forEach((r, i) => expect(JSON.stringify({ ...r.json, content: '' })).not.toContain(users[i]));
    s.close();
  });

  it('rate-limits per forwarded client IP on Vercel', async () => {
    const s = await vercelLike(createAIHandler({ env: { VERCEL: '1', LEXIMASTER_AI_RATE_LIMIT: '2' }, call: async () => ({ text: '{}', latencyMs: 1 }) }));
    const body = { config: { provider: 'openai', model: 'm', apiKey: 'k' } };
    const a = [];
    for (let i = 0; i < 3; i++) a.push((await post(s.url, '/api/ai/test', body, { 'x-forwarded-for': '198.51.100.7' })).status);
    const other = (await post(s.url, '/api/ai/test', body, { 'x-forwarded-for': '198.51.100.8' })).status;
    expect(a).toEqual([200, 200, 429]);
    expect(other).toBe(200);
    s.close();
  });

  it('vercel.json: SPA fallback never captures /api/* or built assets', () => {
    const cfg = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url)));
    const rw = cfg.rewrites.find((r) => r.destination === '/index.html');
    const re = new RegExp('^' + rw.source.replace(/^\//, '/') + '$');
    for (const p of ['/', '/practice', '/some/deep/link']) expect(re.test(p)).toBe(true);
    for (const p of ['/api/health', '/api/ai/test', '/api/ai/generate', '/assets/index-abc.js']) expect(re.test(p)).toBe(false);
    expect(cfg.functions['api/**/*.js'].maxDuration).toBeGreaterThanOrEqual(50);
  });

  it('enforces a hard deadline even if the upstream trickles data', async () => {
    const srv = http.createServer((_req, res) => {
      res.writeHead(200);
      const t = setInterval(() => res.write(' '), 50);
      res.on('close', () => clearInterval(t));
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const started = Date.now();
    await expect(guardedRequest(`http://127.0.0.1:${srv.address().port}/`, { body: {}, allowPrivate: true, timeoutMs: 300 })).rejects.toMatchObject({ code: 'timeout' });
    expect(Date.now() - started).toBeLessThan(1500);
    srv.close();
  });
});

describe('cache safety', () => {
  it('API responses forbid caching at browser, Vercel and Cloudflare layers', async () => {
    const s = await vercelLike(health);
    const r = await fetch(s.url + '/api/health');
    expect(r.headers.get('cache-control')).toMatch(/no-store/);
    expect(r.headers.get('cdn-cache-control')).toBe('no-store');
    expect(r.headers.get('cloudflare-cdn-cache-control')).toBe('no-store');
    s.close();
  });
});
