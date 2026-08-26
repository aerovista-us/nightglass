import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { resolvePublicHost, validateCaptureUrl } from './security.mjs';

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const ALLOWED_TYPES = ['text/html', 'application/xhtml+xml', 'text/plain', 'application/json'];

function safeHeaders(headers) {
  const blocked = new Set(['set-cookie', 'proxy-authenticate', 'proxy-authorization']);
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const lower = key.toLowerCase();
    if (blocked.has(lower)) continue;
    if (value == null) continue;
    const rendered = Array.isArray(value) ? value.join(', ') : String(value);
    out[lower] = rendered.slice(0, 4096);
  }
  return out;
}

function requestPinned(url, records, { timeoutMs, maxBytes }) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname || '/'}${url.search || ''}`,
      method: 'GET',
      servername: isIP(url.hostname) ? undefined : url.hostname,
      headers: {
        'user-agent': 'Nightglass-Evidence-Capture/0.2',
        accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.8',
        'accept-encoding': 'identity',
        connection: 'close'
      },
      lookup: (_hostname, options, callback) => {
        if (options?.all) return callback(null, records);
        const record = records[0];
        callback(null, record.address, record.family);
      }
    }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          request.destroy(new Error(`Capture response exceeded ${maxBytes} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        headers: safeHeaders(response.headers),
        body: Buffer.concat(chunks)
      }));
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Capture request timed out')));
    request.on('error', reject);
    request.end();
  });
}

async function fetchWithRedirects(rawUrl, options, hop = 0, chain = []) {
  if (hop > options.maxRedirects) throw new Error('Too many capture redirects');
  const url = validateCaptureUrl(rawUrl);
  const records = await resolvePublicHost(url.hostname);
  const response = await requestPinned(url, records, options);
  const nextChain = [...chain, url.toString()];

  if (REDIRECTS.has(response.status) && response.headers.location) {
    const redirected = new URL(response.headers.location, url).toString();
    return fetchWithRedirects(redirected, options, hop + 1, nextChain);
  }
  return { ...response, finalUrl: url.toString(), redirectChain: nextChain };
}

export async function captureUrl(rawUrl, {
  outputDir = process.env.CAPTURE_DIR || '/captures',
  timeoutMs = Number(process.env.CAPTURE_TIMEOUT_MS || 15000),
  maxBytes = Number(process.env.CAPTURE_MAX_BYTES || 5 * 1024 * 1024),
  maxRedirects = Number(process.env.CAPTURE_MAX_REDIRECTS || 4)
} = {}) {
  const limits = {
    timeoutMs: Math.max(1000, Math.min(60000, timeoutMs || 15000)),
    maxBytes: Math.max(1024, Math.min(20 * 1024 * 1024, maxBytes || 5 * 1024 * 1024)),
    maxRedirects: Math.max(0, Math.min(8, maxRedirects || 4))
  };
  const result = await fetchWithRedirects(rawUrl, limits);
  const contentType = String(result.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType && !ALLOWED_TYPES.includes(contentType)) throw new Error(`Unsupported capture content type: ${contentType}`);
  if (result.status < 200 || result.status >= 400) throw new Error(`Capture returned HTTP ${result.status}`);

  const captureId = `capture_${randomUUID()}`;
  const extension = contentType === 'application/json' ? '.json' : contentType === 'text/plain' ? '.txt' : '.html';
  const filename = `${captureId}${extension}`;
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, filename), result.body, { flag: 'wx' });
  const sha256 = createHash('sha256').update(result.body).digest('hex');

  return {
    captureId,
    capturedAt: new Date().toISOString(),
    requestedUrl: validateCaptureUrl(rawUrl).toString(),
    finalUrl: result.finalUrl,
    redirectChain: result.redirectChain,
    status: result.status,
    headers: result.headers,
    contentType: contentType || 'unknown',
    bytes: result.body.length,
    contentSha256: sha256,
    snapshotRef: filename,
    screenshotRef: '',
    screenshotStatus: 'not_configured'
  };
}
