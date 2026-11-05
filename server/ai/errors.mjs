export class AIError extends Error {
  /** @param {string} code @param {string} message @param {object} [extra] */
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

/** HTTP status the proxy returns to the browser for each error code. */
export const STATUS = {
  bad_request: 400, invalid_config: 400, invalid_base_url: 400, blocked_address: 400, payload_too_large: 413,
  auth_failed: 401, model_not_found: 404, rate_limited: 429, timeout: 504, network: 502, upstream_error: 502,
  response_too_large: 502, empty_response: 502, safety_blocked: 422, not_configured: 400, cancelled: 499, proxy_rate_limited: 429,
};

/** Remove anything that looks like a secret from text that may be shown to users or logged. */
export function scrub(text, secrets = []) {
  let t = String(text ?? '');
  for (const s of secrets) if (s && s.length > 4) t = t.split(s).join('[redacted]');
  return t.replace(/(sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,}|sk-ant-[A-Za-z0-9_-]{8,})/g, '[redacted]').slice(0, 400);
}
