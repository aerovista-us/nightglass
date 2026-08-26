function firstUrl(value, depth = 0) {
  if (depth > 4 || value == null) return '';
  if (typeof value === 'string') return /^https?:\/\//i.test(value) ? value : '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstUrl(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value === 'object') {
    for (const key of ['source_url', 'url', 'link', 'html_url']) {
      const candidate = value[key];
      if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) return candidate;
    }
    for (const child of Object.values(value)) {
      const found = firstUrl(child, depth + 1);
      if (found) return found;
    }
  }
  return '';
}

function resultCount(value) {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== 'object') return value == null ? 0 : 1;
  for (const key of ['results', 'items', 'records', 'data', 'matches']) {
    if (Array.isArray(value[key])) return value[key].length;
  }
  return Object.keys(value).length ? 1 : 0;
}

export function normalizeShadowBrokerResult({ tool, targetType, targetValue, data }) {
  const count = resultCount(data);
  const sourceUrl = firstUrl(data);
  const sourceConfidence = ['dns', 'whois', 'certs', 'ip', 'bgp'].includes(tool) ? 0.8 : 0.7;
  const matchConfidence = tool === 'sanctions' ? 0.6 : 0.75;

  return {
    kind: `signal:${tool}`,
    value: `${targetValue} · ${tool} · ${count} result${count === 1 ? '' : 's'}`,
    url: sourceUrl,
    provider: 'shadowbroker',
    entity: {
      type: targetType,
      value: targetValue
    },
    confidence: {
      overall: Math.min(sourceConfidence, matchConfidence),
      source: sourceConfidence,
      match: matchConfidence,
      correlation: 0.5,
      freshness: 0.7
    },
    verificationStatus: 'observed',
    source: {
      provider: 'shadowbroker',
      type: `osint:${tool}`,
      url: sourceUrl,
      query: { tool, targetType, targetValue }
    },
    raw: {
      tool,
      targetType,
      targetValue,
      data
    }
  };
}
