import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCommand } from './util.mjs';

export async function sherlockSearch(username) {
  const tmp = path.join(os.tmpdir(), `sherlock-${crypto.randomUUID()}.json`);
  try {
    await runCommand(process.env.SHERLOCK_BIN || 'sherlock', [username, '--json', tmp, '--print-found', '--no-color'], Number(process.env.JOB_TIMEOUT_MS || 120000));
    const parsed = JSON.parse(await fs.readFile(tmp, 'utf8'));
    const rows = Array.isArray(parsed) ? parsed : Object.values(parsed);
    return rows.filter(Boolean).map(item => ({
      kind: 'account_candidate',
      value: item.name || item.site_name || username,
      url: item.url_user || item.url || '',
      confidence: item.status === 'Claimed' || item.exists === true ? 0.8 : 0.55,
      raw: item
    })).filter(x => x.url);
  } finally {
    fs.rm(tmp, { force: true }).catch(() => {});
  }
}
