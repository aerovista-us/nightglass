import { mockSearch } from './mock.mjs';
import { sherlockSearch } from './sherlock.mjs';
import { holeheSearch } from './holehe.mjs';
import { shadowBrokerSearch } from './shadowbroker/index.mjs';
import { shadowBrokerTargetTypes } from './shadowbroker/capabilities.mjs';
import { runRecordProvider } from '../records/registry.mjs';

const truthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());

export const engines = {
  sherlock: { label: 'Sherlock', targetTypes: ['username'], local: true, orchestrated: true, group: 'trace', configured: true },
  holehe: { label: 'Holehe', targetTypes: ['email'], local: true, orchestrated: true, group: 'trace', configured: true },
  shadowbroker: {
    label: 'SIGNAL · ShadowBroker',
    targetTypes: shadowBrokerTargetTypes,
    local: false,
    optional: true,
    orchestrated: true,
    group: 'signal',
    passiveOnly: true,
    configured: truthy(process.env.SHADOWBROKER_ENABLED)
  },
  sec: {
    label: 'RECORDS · SEC',
    targetTypes: ['company'],
    local: false,
    optional: true,
    orchestrated: true,
    group: 'records',
    passiveOnly: true,
    requiresEnv: ['SEC_USER_AGENT'],
    configured: Boolean(String(process.env.SEC_USER_AGENT || '').trim())
  },
  spiderfoot: { label: 'SpiderFoot', targetTypes: ['email','username','domain'], local: true, companion: true, orchestrated: false, group: 'trace', configured: true }
};

export async function runEngine(engine, targetType, targetValue) {
  const meta = engines[engine];
  if (!meta) throw new Error('Unknown engine');
  if (!meta.targetTypes.includes(targetType)) throw new Error(`${engine} does not support ${targetType}`);
  if ((process.env.ENGINE_MODE || 'mock') !== 'live') return mockSearch({ engine, targetType, targetValue });
  if (meta.optional && meta.configured === false) throw new Error(`${engine} is not enabled/configured`);
  const missing = (meta.requiresEnv || []).filter((name) => !String(process.env[name] || '').trim());
  if (missing.length) throw new Error(`${engine} requires configuration: ${missing.join(', ')}`);
  if (engine === 'sherlock') return sherlockSearch(targetValue);
  if (engine === 'holehe') return holeheSearch(targetValue);
  if (engine === 'shadowbroker') return shadowBrokerSearch(targetType, targetValue);
  if (engine === 'sec') return runRecordProvider('sec', targetType, targetValue);
  if (engine === 'spiderfoot') throw new Error('SpiderFoot remains a companion until its scan API adapter is implemented.');
  return [];
}
