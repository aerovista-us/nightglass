import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFinding } from '../src/normalize/finding.mjs';

test('normalizes legacy engine finding into Nightglass shape', () => {
  const n = normalizeFinding({
    engine: 'sherlock',
    targetType: 'username',
    targetValue: 'Example_User',
    finding: { kind: 'profile', value: 'Example_User', url: 'https://example.test/u', confidence: 0.8, raw: { site: 'example' } }
  });
  assert.equal(n.entity.type, 'username');
  assert.equal(n.entity.canonicalValue, 'example_user');
  assert.equal(n.finding.kind, 'profile');
  assert.equal(n.confidence.source, 0.8);
  assert.equal(n.verificationStatus, 'unverified');
  assert.equal(n.source.provider, 'sherlock');
});
