import { createHash } from 'node:crypto';
import { db, id, now } from '../db.mjs';
import { cleanText } from '../security/validation.mjs';
import { canonicalizeEntity } from '../normalize/finding.mjs';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(stable(value ?? {}));
}

export function hashRecord(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function upsertEntity(caseId, entity) {
  if (!entity?.type || !entity?.canonicalValue) return '';
  const ts = now();
  const existing = db.prepare(`
    SELECT * FROM entities WHERE case_id=? AND type=? AND canonical_value=?
  `).get(caseId, entity.type, entity.canonicalValue);

  if (existing) {
    const confidence = Math.max(Number(existing.confidence || 0), Number(entity.confidence || 0));
    const status = existing.verification_status === 'unverified' ? (entity.verificationStatus || 'unverified') : existing.verification_status;
    db.prepare(`
      UPDATE entities SET display_value=?, label=?, confidence=?, verification_status=?, last_seen_at=? WHERE id=?
    `).run(
      cleanText(entity.displayValue || existing.display_value, 500),
      cleanText(entity.label || existing.label, 160),
      confidence,
      status,
      ts,
      existing.id
    );
    return existing.id;
  }

  const entityId = id('entity');
  db.prepare(`
    INSERT INTO entities (id,case_id,type,canonical_value,display_value,label,confidence,verification_status,first_seen_at,last_seen_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    entityId,
    caseId,
    cleanText(entity.type, 40),
    cleanText(entity.canonicalValue, 500),
    cleanText(entity.displayValue || entity.canonicalValue, 500),
    cleanText(entity.label || '', 160),
    Number(entity.confidence ?? 0.5),
    cleanText(entity.verificationStatus || 'unverified', 40),
    ts,
    ts
  );
  return entityId;
}

export function ensureSubjectEntity(caseId, type, value, label = '') {
  const canonicalValue = canonicalizeEntity(type, value);
  return upsertEntity(caseId, {
    type,
    canonicalValue,
    displayValue: value,
    label,
    confidence: 1,
    verificationStatus: 'observed'
  });
}

function relationEntity(input) {
  if (!input?.type) return null;
  const value = String(input.value ?? input.displayValue ?? input.canonicalValue ?? '').trim();
  if (!value) return null;
  return {
    type: cleanText(input.type, 40),
    canonicalValue: cleanText(input.canonicalValue || canonicalizeEntity(input.type, value), 500),
    displayValue: cleanText(input.displayValue || value, 500),
    label: cleanText(input.label || '', 160),
    confidence: Number(input.confidence ?? 0.5),
    verificationStatus: cleanText(input.verificationStatus || 'unverified', 40)
  };
}

export function upsertRelationship(caseId, relation, sourceId = '') {
  const from = relationEntity(relation?.from);
  const to = relationEntity(relation?.to);
  const type = cleanText(relation?.type, 60);
  if (!from || !to || !type) return '';

  const fromId = upsertEntity(caseId, from);
  const toId = upsertEntity(caseId, to);
  if (!fromId || !toId || fromId === toId) return '';

  const conf = relation.confidence || {};
  const sourceConfidence = Number(conf.source ?? relation.sourceConfidence ?? 0.5);
  const matchConfidence = Number(conf.match ?? relation.matchConfidence ?? 0.5);
  const correlationConfidence = Number(conf.correlation ?? relation.correlationConfidence ?? 0.5);
  const verificationStatus = cleanText(relation.verificationStatus || 'unverified', 40);
  const ts = now();

  let row = db.prepare(`
    SELECT * FROM relationships WHERE case_id=? AND from_entity_id=? AND to_entity_id=? AND type=?
  `).get(caseId, fromId, toId, type);

  if (row) {
    db.prepare(`
      UPDATE relationships
      SET source_confidence=?, match_confidence=?, correlation_confidence=?, verification_status=?, last_seen_at=?
      WHERE id=?
    `).run(
      Math.max(Number(row.source_confidence || 0), sourceConfidence),
      Math.max(Number(row.match_confidence || 0), matchConfidence),
      Math.max(Number(row.correlation_confidence || 0), correlationConfidence),
      row.verification_status === 'unverified' ? verificationStatus : row.verification_status,
      ts,
      row.id
    );
  } else {
    const relationshipId = id('relationship');
    db.prepare(`
      INSERT INTO relationships (
        id,case_id,from_entity_id,to_entity_id,type,source_confidence,match_confidence,
        correlation_confidence,verification_status,first_seen_at,last_seen_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      relationshipId, caseId, fromId, toId, type, sourceConfidence, matchConfidence,
      correlationConfidence, verificationStatus, ts, ts
    );
    row = { id: relationshipId };
  }

  if (sourceId) {
    db.prepare(`
      INSERT OR IGNORE INTO relationship_sources (relationship_id,source_id) VALUES (?,?)
    `).run(row.id, sourceId);
  }
  return row.id;
}

export function persistNormalizedFinding({ caseId, jobId, engine, normalized }) {
  const entityId = upsertEntity(caseId, normalized.entity);
  const findingId = id('finding');
  const ts = now();
  const rawJson = stableJson(normalized.raw || {});
  const normalizedJson = stableJson(normalized);

  db.prepare(`
    INSERT INTO findings (
      id,case_id,job_id,engine,kind,value,url,confidence,raw_json,created_at,
      entity_id,source_confidence,match_confidence,correlation_confidence,freshness,verification_status,normalized_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    findingId,
    caseId,
    jobId,
    cleanText(engine, 40),
    cleanText(normalized.finding.kind, 100),
    cleanText(normalized.finding.value, 1000),
    cleanText(normalized.finding.url || '', 2048),
    Number(normalized.finding.confidence ?? 0.5),
    rawJson,
    ts,
    entityId,
    Number(normalized.confidence.source ?? 0.5),
    Number(normalized.confidence.match ?? 0.5),
    Number(normalized.confidence.correlation ?? 0.5),
    Number(normalized.confidence.freshness ?? 0.5),
    cleanText(normalized.verificationStatus || 'unverified', 40),
    normalizedJson
  );

  const source = normalized.source || {};
  const retrievedAt = ts;
  const queryJson = stableJson(source.query || {});
  const sourceRecord = {
    caseId,
    findingId,
    provider: source.provider || engine,
    sourceType: source.sourceType || 'provider',
    sourceUrl: source.sourceUrl || '',
    query: source.query || {},
    raw: normalized.raw || {},
    retrievedAt
  };
  const sourceId = id('source');
  db.prepare(`
    INSERT INTO sources (id,case_id,finding_id,provider,source_type,source_url,query_json,raw_json,retrieved_at,sha256)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    sourceId,
    caseId,
    findingId,
    cleanText(sourceRecord.provider, 80),
    cleanText(sourceRecord.sourceType, 40),
    cleanText(sourceRecord.sourceUrl, 2048),
    queryJson,
    rawJson,
    retrievedAt,
    hashRecord(sourceRecord)
  );

  const relationshipIds = [];
  for (const relation of (normalized.relationships || []).slice(0, 100)) {
    const relationshipId = upsertRelationship(caseId, relation, sourceId);
    if (relationshipId) relationshipIds.push(relationshipId);
  }

  return { findingId, entityId, sourceId, relationshipIds };
}
