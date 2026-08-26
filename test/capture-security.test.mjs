import test from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedIp, validateCaptureUrl } from '../capture-worker/security.mjs';

test('capture guard blocks private and local IPv4 networks', () => {
  for (const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','172.31.255.254','192.168.10.5','169.254.1.1','100.64.0.1']) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
  assert.equal(isBlockedIp('8.8.8.8'), false);
});

test('capture guard blocks local IPv6 networks', () => {
  for (const ip of ['::1','fc00::1','fd12::1','fe80::1','ff02::1','2001:db8::1']) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
  assert.equal(isBlockedIp('2606:4700:4700::1111'), false);
});

test('capture URL policy permits only web schemes and standard ports', () => {
  assert.equal(validateCaptureUrl('https://example.com/path#fragment').toString(), 'https://example.com/path');
  assert.throws(() => validateCaptureUrl('file:///etc/passwd'));
  assert.throws(() => validateCaptureUrl('http://example.com:8080/'));
  assert.throws(() => validateCaptureUrl('https://user:pass@example.com/'));
});
