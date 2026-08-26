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

function relation(fromType, fromValue, type, toType, toValue, confidence = {}) {
  const value = String(toValue || '').trim().replace(/\.$/, '');
  if (!value) return null;
  return {
    type,
    from: { type: fromType, value: fromValue, confidence: confidence.match ?? 0.8, verificationStatus: 'observed' },
    to: { type: toType, value, confidence: confidence.match ?? 0.8, verificationStatus: 'observed' },
    confidence: {
      source: confidence.source ?? 0.8,
      match: confidence.match ?? 0.8,
      correlation: confidence.correlation ?? 0.75
    },
    verificationStatus: 'observed'
  };
}

function relationshipsFromResult(tool, targetType, targetValue, data) {
  const relationships = [];
  if (!data || typeof data !== 'object') return relationships;

  if (tool === 'dns' && targetType === 'domain') {
    for (const ip of (data.summary?.ip_addresses || []).slice(0, 25)) {
      const r = relation('domain', targetValue, 'resolves_to', 'ip', ip, { source: 0.9, match: 0.95, correlation: 0.95 });
      if (r) relationships.push(r);
    }
  }

  if (tool === 'whois' && targetType === 'domain') {
    for (const ent of (data.rdap?.entities || []).slice(0, 25)) {
      const roles = Array.isArray(ent.roles) ? ent.roles.map((x) => String(x).toLowerCase()) : [];
      if (!roles.includes('registrant')) continue;
      if (ent.org) {
        const r = relation('domain', targetValue, 'registered_to', 'company', ent.org, { source: 0.9, match: 0.8, correlation: 0.85 });
        if (r) relationships.push(r);
      }
      if (ent.name && ent.name !== ent.org) {
        const r = relation('domain', targetValue, 'registered_to', 'person', ent.name, { source: 0.9, match: 0.7, correlation: 0.8 });
        if (r) relationships.push(r);
      }
    }
  }

  if (tool === 'certs' && targetType === 'domain') {
    for (const subdomain of (data.subdomains || []).slice(0, 25)) {
      if (String(subdomain).toLowerCase() === String(targetValue).toLowerCase()) continue;
      const r = relation('domain', targetValue, 'associated_with', 'domain', subdomain, { source: 0.85, match: 0.8, correlation: 0.7 });
      if (r) relationships.push(r);
    }
  }

  if (tool === 'ip' && targetType === 'ip') {
    const org = data.geo?.org || data.geo?.isp || '';
    if (org) {
      const r = relation('ip', targetValue, 'associated_with', 'company', org, { source: 0.75, match: 0.65, correlation: 0.65 });
      if (r) relationships.push(r);
    }
  }

  return relationships;
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
    relationships: relationshipsFromResult(tool, targetType, targetValue, data),
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
