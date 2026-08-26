import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { captureUrl } from './capture.mjs';

const host = process.env.CAPTURE_HOST || '0.0.0.0';
const port = Number(process.env.CAPTURE_PORT || 8090);
const token = String(process.env.CAPTURE_WORKER_TOKEN || '');
const maxBody = 8192;

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function authorized(req) {
  if (!token) return false;
  const supplied = String(req.headers['x-nightglass-capture-token'] || '');
  const a = Buffer.from(token);
  const b = Buffer.from(supplied);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBody) throw new Error('Request too large');
  }
  return body ? JSON.parse(body) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://capture-worker');
  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true, capture: true, tokenConfigured: Boolean(token) });
  }
  if (req.method !== 'POST' || url.pathname !== '/capture') return json(res, 404, { error: 'Not found' });
  if (!authorized(req)) return json(res, 401, { error: 'Unauthorized capture request' });

  try {
    const body = await readJson(req);
    const result = await captureUrl(body.url);
    return json(res, 201, result);
  } catch (error) {
    return json(res, 400, { error: error?.message || 'Capture failed' });
  }
});

server.listen(port, host, () => {
  console.log(`Nightglass capture worker listening on ${host}:${port}`);
});
