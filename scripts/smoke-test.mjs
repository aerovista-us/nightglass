import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const port = 3199;
const dataDir = '/tmp/nightglass-smoke';
rmSync(dataDir, { recursive: true, force: true });
const child = spawn(process.execPath, ['server.mjs'], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, ENGINE_MODE: 'mock' },
  stdio: ['ignore', 'pipe', 'inherit']
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const request = (path, options = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
  headers: { 'content-type': 'application/json' },
  ...options
});

try {
  let health;
  for (let i = 0; i < 20; i += 1) {
    try {
      const r = await request('/api/health');
      if (r.ok) { health = await r.json(); break; }
    } catch {}
    await wait(100);
  }
  if (!health?.ok) throw new Error('health failed');
  if (String(health.schemaVersion) !== '2') throw new Error('schema migration not active');

  let r = await request('/api/cases', { method: 'POST', body: JSON.stringify({ title: 'Smoke Test' }) });
  const c = (await r.json()).case;
  if (!c?.id) throw new Error('case create failed');

  r = await request(`/api/cases/${c.id}/subjects`, {
    method: 'POST',
    body: JSON.stringify({ type: 'username', value: 'example_user', label: 'Smoke subject' })
  });
  const subject = await r.json();
  if (!subject.entityId) throw new Error('canonical subject entity missing');

  r = await request(`/api/cases/${c.id}/trace`, {
    method: 'POST',
    body: JSON.stringify({ profile: 'standard', targetType: 'username', targetValue: 'example_user' })
  });
  if (r.status !== 202) throw new Error('trace enqueue failed');
  const trace = await r.json();
  if (trace.jobs?.length !== 2) throw new Error('unexpected standard TRACE plan');

  let d;
  for (let i = 0; i < 30; i += 1) {
    await wait(100);
    r = await request(`/api/cases/${c.id}`);
    d = await r.json();
    if (d.jobs?.length >= 2 && d.jobs.every((job) => ['complete', 'failed'].includes(job.status))) break;
  }
  if (!d.findings?.length) throw new Error('mock findings missing');
  if (!d.entities?.length) throw new Error('canonical entities missing');
  if (!d.sources?.length) throw new Error('source provenance missing');
  if (d.findings.some((f) => !f.normalized_json)) throw new Error('normalized findings missing');

  r = await request(`/api/cases/${c.id}/evidence`, {
    method: 'POST',
    body: JSON.stringify({ url: 'https://example.invalid/evidence', title: 'Smoke evidence', notes: 'CI provenance check' })
  });
  const evidence = (await r.json()).evidence;
  if (!/^[a-f0-9]{64}$/.test(evidence?.sha256 || '')) throw new Error('evidence hash missing');

  console.log('smoke ok');
} finally {
  child.kill('SIGTERM');
}
