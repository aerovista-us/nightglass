import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTracePlan } from '../src/orchestration/trace.mjs';
import { engines } from '../src/engines/registry.mjs';

test('standard username trace schedules Sherlock and SIGNAL', () => {
  const plan = buildTracePlan({ profile: 'standard', targetType: 'username', engines });
  assert.deepEqual(plan.scheduled, ['sherlock', 'shadowbroker']);
  assert.deepEqual(plan.skipped, []);
});

test('deep domain trace explicitly skips SpiderFoot companion until adapter exists', () => {
  const plan = buildTracePlan({ profile: 'deep', targetType: 'domain', engines });
  assert.deepEqual(plan.scheduled, ['shadowbroker']);
  assert.equal(plan.skipped[0].engine, 'spiderfoot');
  assert.equal(plan.skipped[0].reason, 'companion_adapter_not_implemented');
});
