import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => ((acc << 8) | Number(part)) >>> 0, 0) >>> 0;
}

function inV4Range(ip, network, prefix) {
  const value = ipv4ToInt(ip);
  const base = ipv4ToInt(network);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

export function isBlockedIp(address) {
  const ip = String(address || '').trim().toLowerCase();
  const version = isIP(ip);
  if (version === 4) {
    const blocked = [
      ['0.0.0.0', 8],
      ['10.0.0.0', 8],
      ['100.64.0.0', 10],
      ['127.0.0.0', 8],
      ['169.254.0.0', 16],
      ['172.16.0.0', 12],
      ['192.0.0.0', 24],
      ['192.168.0.0', 16],
      ['198.18.0.0', 15],
      ['224.0.0.0', 4],
      ['240.0.0.0', 4]
    ];
    return blocked.some(([network, prefix]) => inV4Range(ip, network, prefix));
  }
  if (version === 6) {
    if (ip === '::' || ip === '::1') return true;
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // unique-local fc00::/7
    if (/^fe[89ab]/.test(ip)) return true; // link-local fe80::/10
    if (ip.startsWith('ff')) return true; // multicast ff00::/8
    if (ip.startsWith('2001:db8:')) return true; // documentation range
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    return false;
  }
  return true;
}

export function validateCaptureUrl(raw) {
  const value = String(raw || '').trim();
  if (!value || value.length > 2048) throw new Error('Invalid capture URL');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Capture supports http/https only');
  if (url.username || url.password) throw new Error('Credential-bearing URLs are not allowed');
  if (!url.hostname) throw new Error('Capture URL requires a hostname');
  const port = url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80);
  if (!Number.isInteger(port) || ![80, 443].includes(port)) throw new Error('Capture only allows ports 80 and 443');
  url.hash = '';
  return url;
}

export async function resolvePublicHost(hostname) {
  const host = String(hostname || '').trim();
  const literal = isIP(host);
  const records = literal ? [{ address: host, family: literal }] : await lookup(host, { all: true, verbatim: true });
  if (!records.length) throw new Error('Hostname did not resolve');
  if (records.some((record) => isBlockedIp(record.address))) throw new Error('Capture target resolves to a blocked network');
  return records;
}
