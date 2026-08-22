import { spawn } from 'node:child_process';

export function runCommand(command, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, env: { ...process.env, NO_COLOR: '1' } });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Engine timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', d => { stdout += d.toString(); if (stdout.length > 2_000_000) child.kill('SIGKILL'); });
    child.stderr.on('data', d => { stderr += d.toString(); if (stderr.length > 1_000_000) child.kill('SIGKILL'); });
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}
