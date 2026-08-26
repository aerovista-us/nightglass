import { searchSecCompanies } from './sec-company.mjs';

export const recordProviders = Object.freeze({
  sec: {
    label: 'U.S. SEC Company Directory',
    targetTypes: ['company'],
    authority: 'U.S. Securities and Exchange Commission',
    sourceClass: 'government',
    attributionRequired: true,
    configured: () => Boolean(String(process.env.SEC_USER_AGENT || '').trim())
  }
});

export async function runRecordProvider(provider, targetType, targetValue) {
  const meta = recordProviders[provider];
  if (!meta) throw new Error('Unknown RECORDS provider');
  if (!meta.targetTypes.includes(targetType)) throw new Error(`${provider} does not support ${targetType}`);
  if (provider === 'sec') return searchSecCompanies(targetValue);
  return [];
}

export function recordProviderStatus() {
  return Object.fromEntries(Object.entries(recordProviders).map(([key, value]) => [key, {
    label: value.label,
    targetTypes: value.targetTypes,
    authority: value.authority,
    sourceClass: value.sourceClass,
    attributionRequired: value.attributionRequired,
    configured: value.configured()
  }]));
}
