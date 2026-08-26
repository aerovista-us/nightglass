import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVerificationStatus, verificationStates } from '../src/review/verification.mjs';

test('verification states are explicit and stable', () => {
  assert.deepEqual(verificationStates, ['unverified','observed','corroborated','conflicting','rejected']);
  for (const state of verificationStates) assert.equal(validateVerificationStatus(state.toUpperCase()), state);
});

test('unknown verification states are rejected', () => {
  assert.throws(() => validateVerificationStatus('probably'));
  assert.throws(() => validateVerificationStatus(''));
});
