import { mockSearch } from './mock.mjs';
import { sherlockSearch } from './sherlock.mjs';
import { holeheSearch } from './holehe.mjs';

export const engines = {
  sherlock: { label: 'Sherlock', targetTypes: ['username'], local: true },
  holehe: { label: 'Holehe', targetTypes: ['email'], local: true },
  spiderfoot: { label: 'SpiderFoot', targetTypes: ['email','username','domain'], local: true, companion: true }
};

export async function runEngine(engine, targetType, targetValue) {
  if (!engines[engine]) throw new Error('Unknown engine');
  if (!engines[engine].targetTypes.includes(targetType)) throw new Error(`${engine} does not support ${targetType}`);
  if ((process.env.ENGINE_MODE || 'mock') !== 'live') return mockSearch({ engine, targetType, targetValue });
  if (engine === 'sherlock') return sherlockSearch(targetValue);
  if (engine === 'holehe') return holeheSearch(targetValue);
  if (engine === 'spiderfoot') throw new Error('SpiderFoot companion is not deep-linked in v0.1; open the local SpiderFoot UI and attach results as evidence.');
  return [];
}
