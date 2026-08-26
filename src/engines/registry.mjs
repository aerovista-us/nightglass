import { mockSearch } from './mock.mjs';
import { sherlockSearch } from './sherlock.mjs';
import { holeheSearch } from './holehe.mjs';
import { shadowBrokerSearch } from './shadowbroker/index.mjs';
import { shadowBrokerTargetTypes } from './shadowbroker/capabilities.mjs';

export const engines = {
  sherlock: { label: 'Sherlock', targetTypes: ['username'], local: true, orchestrated: true, group: 'trace' },
  holehe: { label: 'Holehe', targetTypes: ['email'], local: true, orchestrated: true, group: 'trace' },
  shadowbroker: { label: 'SIGNAL · ShadowBroker', targetTypes: shadowBrokerTargetTypes, local: false, optional: true, orchestrated: true, group: 'signal', passiveOnly: true },
  spiderfoot: { label: 'SpiderFoot', targetTypes: ['email','username','domain'], local: true, companion: true, orchestrated: false, group: 'trace' }
};

export async function runEngine(engine, targetType, targetValue) {
  if (!engines[engine]) throw new Error('Unknown engine');
  if (!engines[engine].targetTypes.includes(targetType)) throw new Error(`${engine} does not support ${targetType}`);
  if ((process.env.ENGINE_MODE || 'mock') !== 'live') return mockSearch({ engine, targetType, targetValue });
  if (engine === 'sherlock') return sherlockSearch(targetValue);
  if (engine === 'holehe') return holeheSearch(targetValue);
  if (engine === 'shadowbroker') return shadowBrokerSearch(targetType, targetValue);
  if (engine === 'spiderfoot') throw new Error('SpiderFoot remains a companion until its scan API adapter is implemented.');
  return [];
}
