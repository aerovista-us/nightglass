import { ShadowBrokerClient } from './client.mjs';
import { argsForTool, toolsForTarget } from './capabilities.mjs';
import { normalizeShadowBrokerResult } from './normalize.mjs';

export async function shadowBrokerSearch(targetType, targetValue) {
  const tools = toolsForTarget(targetType);
  if (!tools.length) throw new Error(`ShadowBroker SIGNAL does not support ${targetType}`);

  const client = new ShadowBrokerClient();
  const findings = [];
  for (const tool of tools) {
    const args = argsForTool(tool, targetType, targetValue);
    const { tool: _ignored, ...lookupArgs } = args;
    const data = await client.osintLookup(tool, lookupArgs);
    findings.push(normalizeShadowBrokerResult({ tool, targetType, targetValue, data }));
  }
  return findings;
}
