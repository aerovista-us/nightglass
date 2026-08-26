import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShadowBrokerResult } from '../src/engines/shadowbroker/normalize.mjs';

test('DNS SIGNAL result emits evidence-backed resolves_to relationships', () => {
  const finding = normalizeShadowBrokerResult({
    tool: 'dns',
    targetType: 'domain',
    targetValue: 'example.com',
    data: { summary: { ip_addresses: ['93.184.216.34'] }, timestamp: '2026-08-25T00:00:00Z' }
  });
  assert.equal(finding.relationships.length, 1);
  assert.equal(finding.relationships[0].type, 'resolves_to');
  assert.equal(finding.relationships[0].from.value, 'example.com');
  assert.equal(finding.relationships[0].to.type, 'ip');
  assert.equal(finding.relationships[0].to.value, '93.184.216.34');
});

test('RDAP relationship extraction only treats registrant role as registered_to', () => {
  const finding = normalizeShadowBrokerResult({
    tool: 'whois',
    targetType: 'domain',
    targetValue: 'example.com',
    data: {
      rdap: {
        entities: [
          { roles: ['registrar'], org: 'Registrar Inc.' },
          { roles: ['registrant'], org: 'Example Holdings LLC' }
        ]
      }
    }
  });
  assert.equal(finding.relationships.length, 1);
  assert.equal(finding.relationships[0].type, 'registered_to');
  assert.equal(finding.relationships[0].to.value, 'Example Holdings LLC');
});
