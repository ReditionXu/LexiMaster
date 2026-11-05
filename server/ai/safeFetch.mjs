// Outbound request guard for user-supplied AI endpoints (SSRF protection).
//
// - Only https:// (http:// only when private targets are explicitly allowed for local dev).
// - No credentials in the URL, no single-label / .local / .internal hostnames.
// - DNS is resolved at CONNECT time and every resolved address is checked, so a hostname
//   that resolves (or re-binds) to a private, loopback, link-local or cloud-metadata
//   address is refused. Redirects are never followed. Response size is capped.
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { AIError } from './errors.mjs';

function v4ToInt(ip) {
  return ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}
const V4_BLOCKS = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([b, m]) => [v4ToInt(b), m]);

function isPrivateV4(ip) {
  const n = v4ToInt(ip);
  return V4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (base & mask);
  });
}

function expandV6(ip) {
  let s = ip.toLowerCase().split('%')[0];
  // embedded IPv4 tail
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = v4ToInt(v4[1]);
    s = s.slice(0, -v4[1].length) + ((n >>> 16) & 0xffff).toString(16) + ':' + (n & 0xffff).toString(16);
  }
  const [head, tail] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : [];
  const fill = tail !== undefined ? Array(8 - h.length - t.length).fill('0') : [];
  return [...h, ...fill, ...t].map((x) => parseInt(x || '0', 16));
}

export function isPrivateAddress(ip) {
  const fam = net.isIP(ip);
  if (fam === 4) return isPrivateV4(ip);
  if (fam !== 6) return true; // unknown → refuse
  const w = expandV6(ip);
  if (w.length !== 8 || w.some((x) => Number.isNaN(x))) return true;
  const allZero = (a, b) => w.slice(a, b).every((x) => x === 0);
  if (allZero(0, 8)) return true; // ::
  if (allZero(0, 7) && w[7] === 1) return true; // ::1
  if (allZero(0, 5) && w[5] === 0xffff) return isPrivateV4(`${w[6] >> 8}.${w[6] & 255}.${w[7] >> 8}.${w[7] & 255}`); // ::ffff:a.b.c.d
  if (w[0] === 0x64 && w[1] === 0xff9b) return isPrivateV4(`${w[6] >> 8}.${w[6] & 255}.${w[7] >> 8}.${w[7] & 255}`); // NAT64
  if ((w[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local (incl. fd00:ec2::254 metadata)
  if ((w[0] & 0xffc0) === 0xfe80) return true; // link-local
  if ((w[0] & 0xff00) === 0xff00) return true; // multicast
  if (w[0] === 0x2001 && w[1] === 0x0db8) return true; // documentation
  if (w[0] === 0x2002) return isPrivateV4(`${w[1] >> 8}.${w[1] & 255}.${w[2] >> 8}.${w[2] & 255}`); // 6to4
  return false;
}

const BLOCKED_HOST_SUFFIXES = ['.local', '.localhost', '.internal', '.localdomain', '.home.arpa', '.lan', '.intranet', '.corp'];
const BLOCKED_HOSTS = new Set(['localhost', 'metadata', 'metadata.google.internal', 'instance-data', 'kubernetes.default']);

/** Validate a user-supplied base URL. Returns a normalised URL string (no trailing slash). */
export function validateBaseUrl(raw, { allowPrivate = false } = {}) {
  if (typeof raw !== 'string' || raw.length > 300) throw new AIError('invalid_base_url', 'Base URL 无效。');
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new AIError('invalid_base_url', 'Base URL 格式不正确，例如 https://api.example.com/v1');
  }
  if (u.protocol !== 'https:' && !(allowPrivate && u.protocol === 'http:')) {
    throw new AIError('invalid_base_url', 'Base URL 必须使用 https://');
  }
  if (u.username || u.password) throw new AIError('invalid_base_url', 'Base URL 中不能包含用户名或密码。');
  if (u.search || u.hash) throw new AIError('invalid_base_url', 'Base URL 中不能包含查询参数或锚点。');
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!allowPrivate) {
    if (BLOCKED_HOSTS.has(host) || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
      throw new AIError('blocked_address', '不允许访问本机或内网地址。');
    }
    if (net.isIP(host)) {
      if (isPrivateAddress(host)) throw new AIError('blocked_address', '不允许访问内网、回环或云元数据地址。');
    } else if (!host.includes('.')) {
      throw new AIError('blocked_address', '主机名无效：不允许单标签主机名。');
    }
  }
  return u.toString().replace(/\/+$/, '');
}

function guardedLookup(allowPrivate, resolve = dns.lookup) {
  return (hostname, options, callback) => {
    resolve(hostname, { all: true, verbatim: true }, (err, addrs) => {
      if (err) return callback(err);
      const list = Array.isArray(addrs) ? addrs : [];
      if (!list.length) return callback(new Error('DNS 解析无结果'));
      if (!allowPrivate) {
        const bad = list.find((a) => isPrivateAddress(a.address));
        if (bad) {
          const e = new AIError('blocked_address', '目标域名解析到了内网或保留地址，已拒绝连接。');
          return callback(e);
        }
      }
      if (options && options.all) return callback(null, list);
      callback(null, list[0].address, list[0].family);
    });
  };
}

/**
 * POST JSON with SSRF guard, timeout and size cap. Never follows redirects.
 * @returns {Promise<{status:number, headers:object, text:string}>}
 */
export function guardedRequest(url, { method = 'POST', headers = {}, body, timeoutMs = 30000, maxBytes = 2_000_000, allowPrivate = false, signal, resolver } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return reject(new AIError('invalid_base_url', 'URL 无效'));
    }
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (!allowPrivate && net.isIP(host) && isPrivateAddress(host)) {
      return reject(new AIError('blocked_address', '不允许访问内网地址。'));
    }
    const lib = u.protocol === 'http:' ? http : https;
    if (u.protocol === 'http:' && !allowPrivate) return reject(new AIError('invalid_base_url', '必须使用 https://'));
    const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const req = lib.request(
      u,
      {
        method,
        headers: { 'content-type': 'application/json', accept: 'application/json', ...headers, ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}) },
        lookup: guardedLookup(allowPrivate, resolver),
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          return reject(new AIError('upstream_error', `服务商返回重定向（${res.statusCode}），出于安全原因未跟随。`));
        }
        let size = 0;
        const chunks = [];
        res.on('data', (c) => {
          size += c.length;
          if (size > maxBytes) {
            req.destroy();
            reject(new AIError('response_too_large', '服务商响应过大。'));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', (e) => reject(new AIError('network', e.message)));
      }
    );
    // Defence in depth: re-check the address actually connected to (covers every
    // connection attempt, independent of the DNS lookup above).
    req.on('socket', (socket) => {
      const verify = () => {
        const addr = socket.remoteAddress;
        if (!allowPrivate && addr && isPrivateAddress(addr)) {
          req.destroy(new AIError('blocked_address', '实际连接的地址是内网或保留地址，已断开。'));
        }
      };
      socket.once('connect', verify);
      socket.once('secureConnect', verify);
    });
        const onAbort = () => {
      req.destroy();
      reject(new AIError('cancelled', '请求已取消。'));
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }
    // Hard deadline for the whole exchange (the socket `timeout` below is only an idle timeout).
    const deadline = setTimeout(() => {
      req.destroy(new AIError('timeout', `请求超时（${Math.round(timeoutMs / 1000)} 秒）。`));
    }, timeoutMs);
    req.on('close', () => clearTimeout(deadline));
        req.on('timeout', () => {
      req.destroy();
      reject(new AIError('timeout', `请求超时（${Math.round(timeoutMs / 1000)} 秒）。`));
    });
    req.on('error', (e) => {
      if (e instanceof AIError) return reject(e);
      if (e && e.code === 'blocked_address') return reject(e);
      reject(new AIError('network', `无法连接到服务商：${e.code || e.message}`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}
