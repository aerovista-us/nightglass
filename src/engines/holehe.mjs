import { runCommand } from './util.mjs';

export async function holeheSearch(email) {
  const { stdout } = await runCommand(process.env.HOLEHE_BIN || 'holehe', [email], Number(process.env.JOB_TIMEOUT_MS || 120000));
  const out = [];
  for (const line of stdout.split(/\r?\n/)) {
    const clean = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
    if (!clean) continue;
    const positive = /^\[\+\]/.test(clean) || /^\+/.test(clean);
    if (!positive) continue;
    const service = clean.replace(/^\[\+\]\s*/, '').replace(/^\+\s*/, '').split(/\s{2,}|\t/)[0].trim();
    if (service) out.push({ kind: 'service_presence_candidate', value: service, url: '', confidence: 0.65, raw: { line: clean, email } });
  }
  return out;
}
