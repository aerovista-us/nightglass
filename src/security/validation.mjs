import { isIP } from 'node:net';

export function cleanText(value, max = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, max);
}

export function validateTarget(type, raw) {
  const value = cleanText(raw, 320);
  if (!value) throw new Error('Target is required');
  if (type === 'username') {
    if (!/^[A-Za-z0-9_.@-]{1,64}$/.test(value)) throw new Error('Invalid username');
    return value;
  }
  if (type === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254) throw new Error('Invalid email');
    return value.toLowerCase();
  }
  if (type === 'domain') {
    const d = value.toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d)) throw new Error('Invalid domain');
    return d;
  }
  if (type === 'ip') {
    if (!isIP(value)) throw new Error('Invalid IP address');
    return value;
  }
  if (type === 'company' || type === 'person') {
    if (value.length < 2 || value.length > 160) throw new Error(`Invalid ${type}`);
    return value.replace(/\s+/g, ' ');
  }
  if (type === 'phone') {
    const phone = value.replace(/[\s().-]/g, '');
    if (!/^\+?[0-9]{7,20}$/.test(phone)) throw new Error('Invalid phone');
    return phone;
  }
  throw new Error('Unsupported target type');
}

export function validateHttpUrl(raw) {
  const value = cleanText(raw, 2048);
  const u = new URL(value);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http/https URLs are allowed');
  if (u.username || u.password) throw new Error('Credential-bearing URLs are not allowed');
  return u.toString();
}
