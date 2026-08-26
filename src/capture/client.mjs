function captureWorkerUrl() {
  const raw = String(process.env.CAPTURE_WORKER_URL || '').trim();
  if (!raw) throw new Error('Capture worker is not configured');
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Capture worker URL must use http/https');
  if (url.username || url.password) throw new Error('Capture worker URL must not contain credentials');
  return url.toString().replace(/\/$/, '');
}

export async function requestCapture(url) {
  const token = String(process.env.CAPTURE_WORKER_TOKEN || '');
  if (!token) throw new Error('CAPTURE_WORKER_TOKEN is required');
  const baseUrl = captureWorkerUrl();
  const timeout = Math.max(2000, Math.min(90000, Number(process.env.CAPTURE_CLIENT_TIMEOUT_MS || 30000)));
  const response = await fetch(`${baseUrl}/capture`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-nightglass-capture-token': token
    },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(timeout)
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || 'Invalid capture worker response' }; }
  if (!response.ok) throw new Error(String(data.error || `Capture worker failed (${response.status})`));
  return data;
}

export function captureConfigured() {
  return Boolean(String(process.env.CAPTURE_WORKER_URL || '').trim() && String(process.env.CAPTURE_WORKER_TOKEN || '').trim());
}
