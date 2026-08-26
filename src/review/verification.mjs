export const verificationStates = Object.freeze([
  'unverified',
  'observed',
  'corroborated',
  'conflicting',
  'rejected'
]);

const allowed = new Set(verificationStates);

export function validateVerificationStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (!allowed.has(status)) throw new Error('Invalid verification status');
  return status;
}
