import { describe, expect, it } from 'vitest';
import http from 'node:http';
import { isPrivateAddress, validateBaseUrl, guardedRequest } from '../server/ai/safeFetch.mjs';
import { buildRequest, parseResponse, callProvider, normalizeConfig } from '../server/ai/providers.mjs';
import { createAIHandler } from '../server/ai/handler.mjs';
import { generatePrompt } from '../server/ai/prompts.mjs';
import { scrub } from '../server/ai/errors.mjs';

describe('SSRF guard', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd00:ec2::254', '::ffff:127.0.0.1', '::ffff:169.254.169.254', '64:ff9b::a9fe:a9fe', '2002:7f00:1::1', '224.0.0.1',
  ])('blocks %s', (ip) => expect(isPrivateAddress(ip)).toBe(true));
  it.each(['8.8.8.8', '104.18.32.47', '2606:4700::6810:84e5', '172.32.0.1'])('allows public %s', (ip) => expect(isPrivateAddress(ip)).toBe(false));

  it.each([
    ['http://api.example.com/v1', /https/],
    ['https://localhost:11434/v1', /本机|内网/],
    ['https://127.0.0.1/v1', /内网/],
    ['https://169.254.169.254/latest', /内网/],
    ['https://[::1]/v1', /内网/],
    ['https://metadata.google.internal/', /本机|内网/],
    ['https://printer.local/', /本机|内网/],
    ['https://intranet/', /单标签/],
    ['https://user:pass@api.example.com/v1', /用户名/],
    ['https://api.example.com/v1?x=1', /查询/],
    ['ftp://api.example.com', /https/],
    ['not a url', /格式/],
  ])('rejects base URL %s', (url, msg) => {
    expect(() => validateBaseUrl(url)).toThrow(msg);
  });
  it('accepts public https base URLs and normalises trailing slash', () => {
    expect(validateBaseUrl('https://api.deepseek.com/v1/')).toBe('https://api.deepseek.com/v1');
  });
  it('allows localhost only when explicitly enabled for local development', () => {
    expect(validateBaseUrl('http://localhost:11434/v1', { allowPrivate: true })).toBe('http://localhost:11434/v1');
  });
  it('refuses at connect time when a public-looking hostname resolves to a private address', async () => {
    // DNS-rebinding style: a public hostname that resolves to the cloud metadata address
    const resolver = (_h, _o, cb) => cb(null, [{ address: '169.254.169.254', family: 4 }]);
    await expect(guardedRequest('https://evil.example.com/v1', { body: {}, resolver })).rejects.toMatchObject({ code: 'blocked_address' });
    const mixed = (_h, _o, cb) => cb(null, [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }]);
    await expect(guardedRequest('https://evil.example.com/v1', { body: {}, resolver: mixed })).rejects.toMatchObject({ code: 'blocked_address' });
  });
  it('never follows redirects', async () => {
    const srv = http.createServer((_, res) => { res.writeHead(302, { location: 'http://169.254.169.254/' }); res.end(); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const port = srv.address().port;
    await expect(guardedRequest(`http://127.0.0.1:${port}/x`, { body: {}, allowPrivate: true })).rejects.toMatchObject({ code: 'upstream_error' });
    srv.close();
  });
});

describe('provider adapters', () => {
  const msg = { system: 'S', user: 'U', maxTokens: 100, json: true };
  it('OpenAI', () => {
    const r = buildRequest({ provider: 'openai', model: 'm', apiKey: 'k' }, msg);
    expect(r.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(r.headers.authorization).toBe('Bearer k');
    expect(r.body.messages[0]).toEqual({ role: 'system', content: 'S' });
    expect(parseResponse('openai', { choices: [{ message: { content: '{"ok":true}' } }] }).text).toBe('{"ok":true}');
  });
  it('Anthropic', () => {
    const r = buildRequest({ provider: 'anthropic', model: 'claude-x', apiKey: 'k' }, msg);
    expect(r.url).toBe('https://api.anthropic.com/v1/messages');
    expect(r.headers['x-api-key']).toBe('k');
    expect(r.headers['anthropic-version']).toBe('2023-06-01');
    expect(r.body.system).toBe('S');
    expect(parseResponse('anthropic', { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }).text).toBe('ab');
  });
  it('Gemini', () => {
    const r = buildRequest({ provider: 'gemini', model: 'gemini-x', apiKey: 'k' }, msg);
    expect(r.url).toContain('/v1beta/models/gemini-x:generateContent');
    expect(r.headers['x-goog-api-key']).toBe('k');
    expect(r.url).not.toContain('k'.repeat(2));
    expect(r.body.systemInstruction.parts[0].text).toBe('S');
    expect(parseResponse('gemini', { candidates: [{ content: { parts: [{ text: 'x' }] } }] }).text).toBe('x');
    expect(() => parseResponse('gemini', { promptFeedback: { blockReason: 'SAFETY' } })).toThrow(/安全/);
  });
  it('OpenAI-compatible uses the validated base URL', () => {
    const cfg = normalizeConfig({ provider: 'openai-compatible', model: 'deepseek-chat', apiKey: 'k', baseUrl: 'https://api.deepseek.com/v1' });
    expect(buildRequest(cfg, msg).url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(() => normalizeConfig({ provider: 'openai-compatible', model: 'x', apiKey: 'k', baseUrl: 'https://10.0.0.5/v1' })).toThrow();
  });
  it('maps upstream errors and never echoes the key', async () => {
    const cfg = { provider: 'openai', model: 'm', apiKey: 'sk-secret-123456789' };
    const fake = (status, text, headers = {}) => async () => ({ status, text, headers });
    await expect(callProvider(cfg, msg, { request: fake(401, '{"error":{"message":"bad key sk-secret-123456789"}}') })).rejects.toMatchObject({ code: 'auth_failed' });
    try { await callProvider(cfg, msg, { request: fake(401, '{"error":{"message":"bad key sk-secret-123456789"}}') }); } catch (e) { expect(e.message).not.toContain('sk-secret'); }
    await expect(callProvider(cfg, msg, { request: fake(404, '{}') })).rejects.toMatchObject({ code: 'model_not_found' });
    await expect(callProvider(cfg, msg, { request: fake(429, '{}', { 'retry-after': '7' }) })).rejects.toMatchObject({ code: 'rate_limited', retryAfter: 7 });
    await expect(callProvider(cfg, msg, { request: fake(503, 'oops') })).rejects.toMatchObject({ code: 'upstream_error' });
    await expect(callProvider(cfg, msg, { request: fake(200, '{"choices":[{"message":{"content":""}}]}') })).rejects.toMatchObject({ code: 'empty_response' });
  });
  it('scrubs secrets', () => {
    expect(scrub('key sk-abcdefghijk and AIzaSyA1234567890123456789012')).not.toMatch(/sk-abc|AIza/);
  });
});

describe('proxy handler', () => {
  const run = async (handler, { method = 'POST', url, body, type = 'application/json' }) => {
    const srv = http.createServer((req, res) => handler(req, res));
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const res = await fetch(`http://127.0.0.1:${srv.address().port}${url}`, { method, headers: { 'content-type': type }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json();
    srv.close();
    return { status: res.status, json };
  };
  const ok = async () => ({ text: '{"ok":true}', latencyMs: 5 });

  it('health reports server-managed mode without exposing the key', async () => {
    const h = createAIHandler({ env: { AI_PROVIDER: 'openai', AI_MODEL: 'm', AI_API_KEY: 'sk-server-secret' }, call: ok });
    const r = await run(h, { method: 'GET', url: '/api/health' });
    expect(r.json.serverManaged).toEqual({ provider: 'openai', model: 'm' });
    expect(JSON.stringify(r.json)).not.toContain('sk-server');
  });
  it('test connection succeeds with a valid config', async () => {
    const h = createAIHandler({ env: {}, call: ok });
    const r = await run(h, { url: '/api/ai/test', body: { config: { provider: 'anthropic', model: 'claude-x', apiKey: 'k' } } });
    expect(r.status).toBe(200);
    expect(r.json.content).toBe('{"ok":true}');
  });
  it('rejects unknown tasks, wrong content types, bad configs and private base URLs', async () => {
    const h = createAIHandler({ env: {}, call: ok });
    expect((await run(h, { url: '/api/ai/chat', body: {} })).status).toBe(404);
    expect((await run(h, { url: '/api/ai/test', body: {}, type: 'text/plain' })).status).toBe(415);
    expect((await run(h, { url: '/api/ai/test', body: { config: { provider: 'x' } } })).json.error.code).toBe('invalid_config');
    const r = await run(h, { url: '/api/ai/test', body: { config: { provider: 'openai-compatible', model: 'm', baseUrl: 'https://192.168.0.10/v1' } } });
    expect(r.json.error.code).toBe('blocked_address');
  });
  it('rejects oversize generation requests', async () => {
    expect(() => generatePrompt({ words: Array.from({ length: 20 }, (_, i) => ({ wordId: `w${i}`, lemma: 'a', chineseHint: 'b' })) })).toThrow(/上限/);
  });
  it('rate-limits per client', async () => {
    const h = createAIHandler({ env: { LEXIMASTER_AI_RATE_LIMIT: '2' }, call: ok });
    const srv = http.createServer((req, res) => h(req, res));
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const go = () => fetch(`http://127.0.0.1:${srv.address().port}/api/ai/test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ config: { provider: 'openai', model: 'm', apiKey: 'k' } }) });
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await go()).status);
    srv.close();
    expect(codes).toEqual([200, 200, 429]);
  });
});
