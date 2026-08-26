import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, signShadowBrokerRequest } from '../src/engines/shadowbroker/auth.mjs';

test('canonicalJson sorts nested object keys', () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, b: 3 } }), '{"a":{"b":3,"y":2},"z":1}');
});

test('ShadowBroker HMAC helper returns documented headers', () => {
  const headers = signShadowBrokerRequest({
    secret: 'test-secret',
    method: 'POST',
    path: '/api/ai/channel/command',
    body: canonicalJson({ cmd: 'get_summary', args: {} })
  });
  assert.match(headers['X-SB-Timestamp'], /^\d+$/);
  assert.match(headers['X-SB-Nonce'], /^[a-f0-9]{32}$/);
  assert.match(headers['X-SB-Signature'], /^[a-f0-9]{64}$/);
});

test('no secret means local unsigned mode', () => {
  assert.deepEqual(signShadowBrokerRequest({ secret: '', method: 'GET', path: '/x' }), {});
});
