import { canonicalJson, signShadowBrokerRequest } from './auth.mjs';

function validateBaseUrl(raw) {
  const u = new URL(raw || 'http://127.0.0.1:8000');
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('ShadowBroker URL must use http or https');
  if (u.username || u.password) throw new Error('ShadowBroker URL must not contain credentials');
  u.pathname = u.pathname.replace(/\/$/, '');
  return u.toString().replace(/\/$/, '');
}

export class ShadowBrokerClient {
  constructor({
    baseUrl = process.env.SHADOWBROKER_URL || 'http://127.0.0.1:8000',
    hmacSecret = process.env.SHADOWBROKER_HMAC_SECRET || '',
    timeoutMs = Number(process.env.SHADOWBROKER_TIMEOUT_MS || 15000)
  } = {}) {
    this.baseUrl = validateBaseUrl(baseUrl);
    this.hmacSecret = hmacSecret;
    this.timeoutMs = Math.max(1000, Math.min(120000, Number(timeoutMs) || 15000));
  }

  async post(path, payload) {
    const body = canonicalJson(payload);
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json',
      ...signShadowBrokerRequest({
        secret: this.hmacSecret,
        method: 'POST',
        path,
        body
      })
    };

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!response.ok) {
      const message = data?.detail || data?.error || `ShadowBroker request failed (${response.status})`;
      throw new Error(String(message));
    }
    return data;
  }

  async command(cmd, args = {}) {
    if (!/^[a-z0-9_]{1,64}$/.test(cmd)) throw new Error('Invalid ShadowBroker command');
    return this.post('/api/ai/channel/command', { cmd, args });
  }

  static unwrap(response) {
    if (!response || typeof response !== 'object') return {};
    const result = response.result;
    if (!result || typeof result !== 'object') return {};
    if (result.ok === false) throw new Error(String(result.detail || result.error || 'ShadowBroker command failed'));
    return result.data && typeof result.data === 'object' ? result.data : result;
  }

  async osintLookup(tool, args) {
    const response = await this.command('osint_lookup', { tool, ...args });
    return ShadowBrokerClient.unwrap(response);
  }
}
