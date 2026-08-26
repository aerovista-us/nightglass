const clamp = (value, fallback = 0.5) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
};

export function canonicalizeEntity(type, value) {
  const raw = String(value ?? '').trim();
  if (['email', 'domain', 'username', 'ip'].includes(type)) return raw.toLowerCase();
  return raw.replace(/\s+/g, ' ').toLowerCase();
}

function inferEntityType(targetType, finding = {}) {
  if (finding.entity?.type) return String(finding.entity.type);
  if (finding.entityType) return String(finding.entityType);
  if (['email', 'domain', 'username', 'ip', 'company', 'person', 'phone'].includes(targetType)) return targetType;
  return 'unknown';
}

export function normalizeFinding({ engine, targetType, targetValue, finding = {} }) {
  const kind = String(finding.kind || 'observation');
  const value = String(finding.value ?? targetValue ?? '').trim();
  const entityType = inferEntityType(targetType, finding);
  const entityValue = String(finding.entity?.value ?? finding.entityValue ?? value).trim();
  const sourceConfidence = clamp(finding.confidence?.source ?? finding.sourceConfidence ?? finding.confidence, 0.5);
  const matchConfidence = clamp(finding.confidence?.match ?? finding.matchConfidence ?? finding.confidence, 0.5);
  const correlationConfidence = clamp(finding.confidence?.correlation ?? finding.correlationConfidence, 0.5);
  const freshness = clamp(finding.confidence?.freshness ?? finding.freshness, 0.5);
  const verificationStatus = String(finding.verificationStatus || finding.verification_status || 'unverified');

  return {
    entity: entityValue && entityType !== 'unknown' ? {
      type: entityType,
      canonicalValue: canonicalizeEntity(entityType, entityValue),
      displayValue: entityValue,
      label: String(finding.entity?.label || ''),
      confidence: matchConfidence,
      verificationStatus
    } : null,
    finding: {
      kind,
      value,
      url: String(finding.url || ''),
      confidence: clamp(finding.confidence?.overall ?? finding.confidence, matchConfidence)
    },
    relationships: Array.isArray(finding.relationships) ? finding.relationships : [],
    source: {
      provider: String(finding.source?.provider || finding.provider || engine),
      sourceType: String(finding.source?.type || 'provider'),
      sourceUrl: String(finding.source?.url || finding.url || ''),
      query: finding.source?.query || { targetType, targetValue }
    },
    confidence: {
      source: sourceConfidence,
      match: matchConfidence,
      correlation: correlationConfidence,
      freshness
    },
    verificationStatus,
    raw: finding.raw ?? finding,
    normalizedAt: new Date().toISOString()
  };
}
