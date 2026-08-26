export const passiveToolsByTarget = Object.freeze({
  domain: ['dns', 'whois', 'certs'],
  email: ['leaks'],
  username: ['github'],
  ip: ['ip'],
  company: ['sanctions'],
  person: ['sanctions']
});

export const shadowBrokerTargetTypes = Object.freeze(Object.keys(passiveToolsByTarget));

export function toolsForTarget(targetType) {
  return [...(passiveToolsByTarget[targetType] || [])];
}

export function argsForTool(tool, targetType, targetValue) {
  switch (tool) {
    case 'dns':
    case 'whois':
    case 'certs':
      return { tool, domain: targetValue };
    case 'leaks':
      return { tool, email: targetValue };
    case 'github':
      return { tool, username: targetValue };
    case 'ip':
      return { tool, ip: targetValue };
    case 'sanctions':
      return { tool, query: targetValue, limit: 25 };
    default:
      throw new Error(`ShadowBroker tool is not allowlisted: ${tool}`);
  }
}

// Deliberately absent: sweep_init and osint_sweep. Nightglass SIGNAL starts passive-only.
