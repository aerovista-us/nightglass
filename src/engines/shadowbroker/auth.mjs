import { createHash, createHmac, randomBytes } from 'node:crypto';

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortDeep(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(sortDeep(value ?? {}));
}

export function signShadowBrokerRequest({ secret, method, path, body = '' }) {
  if (!secret) return {};
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString('hex');
  const bodyDigest = createHash('sha256').update(body).digest('hex');
  const message = `${String(method).toUpperCase()}|${path}|${timestamp}|${nonce}|${bodyDigest}`;
  const signature = createHmac('sha256', secret).update(message).digest('hex');
  return {
    'X-SB-Timestamp': timestamp,
    'X-SB-Nonce': nonce,
    'X-SB-Signature': signature
  };
}
