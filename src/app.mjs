import fs from 'node:fs/promises';
import path from 'node:path';
import { db, id, now, audit } from './db.mjs';
import { cleanText, validateTarget, validateHttpUrl } from './security/validation.mjs';
import { engines, runEngine } from './engines/registry.mjs';
import { normalizeFinding } from './normalize/finding.mjs';
import { ensureSubjectEntity, hashRecord, persistNormalizedFinding, stableJson } from './store/findings.mjs';
import { buildTracePlan, traceProfiles } from './orchestration/trace.mjs';

const publicDir = path.resolve('public');
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

async function readJson(req) {
  const max = Number(process.env.MAX_BODY_BYTES || 65536);
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > max) throw Object.assign(new Error('Request too large'), { status: 413 });
  }
  if (!body) return {};
  try { return JSON.parse(body); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

function caseExists(caseId) {
  return !!db.prepare('SELECT id FROM cases WHERE id=?').get(caseId);
}

function createJob({ caseId, engine, targetType, targetValue, profile = '', metadata = {} }) {
  const jobId = id('job');
  db.prepare(`
    INSERT INTO jobs (id,case_id,engine,target_type,target_value,status,started_at,profile,metadata_json)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(jobId, caseId, engine, targetType, targetValue, 'running', now(), profile, stableJson(metadata));
  return jobId;
}

async function startJob(jobId, caseId, engine, targetType, targetValue) {
  try {
    const rawFindings = await runEngine(engine, targetType, targetValue);
    let stored = 0;
    for (const finding of rawFindings.slice(0, 500)) {
      const normalized = normalizeFinding({ engine, targetType, targetValue, finding });
      persistNormalizedFinding({ caseId, jobId, engine, normalized });
      stored += 1;
    }
    const finishedAt = now();
    db.prepare('UPDATE jobs SET status=?, finished_at=? WHERE id=?').run('complete', finishedAt, jobId);
    db.prepare('UPDATE cases SET updated_at=? WHERE id=?').run(finishedAt, caseId);
    audit({ caseId, action: 'job.complete', objectType: 'job', objectId: jobId, metadata: { engine, targetType, stored } });
  } catch (e) {
    const finishedAt = now();
    db.prepare('UPDATE jobs SET status=?, error=?, finished_at=? WHERE id=?').run('failed', cleanText(e.message, 1000), finishedAt, jobId);
    db.prepare('UPDATE cases SET updated_at=? WHERE id=?').run(finishedAt, caseId);
    audit({ caseId, action: 'job.failed', objectType: 'job', objectId: jobId, metadata: { engine, targetType, error: cleanText(e.message, 1000) } });
  }
}

function summarizeSources(caseId) {
  return db.prepare(`
    SELECT id,finding_id,provider,source_type,source_url,query_json,retrieved_at,sha256
    FROM sources WHERE case_id=? ORDER BY retrieved_at DESC LIMIT 500
  `).all(caseId);
}

function validCaseObject(table, caseId, objectId) {
  if (!objectId) return true;
  const allowed = new Set(['findings', 'sources']);
  if (!allowed.has(table)) return false;
  return !!db.prepare(`SELECT id FROM ${table} WHERE id=? AND case_id=?`).get(objectId, caseId);
}

export async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && p === '/api/health') {
      const schema = db.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get()?.value || '1';
      return json(res, 200, { ok: true, version: '0.2.0', schemaVersion: schema, engineMode: process.env.ENGINE_MODE || 'mock' });
    }
    if (req.method === 'GET' && p === '/api/engines') {
      return json(res, 200, {
        engines,
        traceProfiles,
        spiderfootUrl: process.env.SPIDERFOOT_URL || '',
        shadowbrokerUrl: process.env.SHADOWBROKER_URL || 'http://127.0.0.1:8000'
      });
    }

    if (req.method === 'GET' && p === '/api/cases') {
      return json(res, 200, { cases: db.prepare('SELECT * FROM cases ORDER BY updated_at DESC').all() });
    }
    if (req.method === 'POST' && p === '/api/cases') {
      const body = await readJson(req);
      const title = cleanText(body.title, 160);
      if (!title) return json(res, 400, { error: 'Title is required' });
      const caseId = id('case');
      const ts = now();
      db.prepare('INSERT INTO cases (id,title,description,status,created_at,updated_at) VALUES (?,?,?,?,?,?)')
        .run(caseId, title, cleanText(body.description, 2000), 'open', ts, ts);
      audit({ caseId, action: 'case.create', objectType: 'case', objectId: caseId, actor: cleanText(body.actor, 120) || 'analyst' });
      return json(res, 201, { case: db.prepare('SELECT * FROM cases WHERE id=?').get(caseId) });
    }

    let m = p.match(/^\/api\/cases\/([^/]+)$/);
    if (m && req.method === 'GET') {
      const caseId = m[1];
      const c = db.prepare('SELECT * FROM cases WHERE id=?').get(caseId);
      if (!c) return json(res, 404, { error: 'Case not found' });
      return json(res, 200, {
        case: c,
        subjects: db.prepare('SELECT * FROM subjects WHERE case_id=? ORDER BY created_at DESC').all(caseId),
        entities: db.prepare('SELECT * FROM entities WHERE case_id=? ORDER BY last_seen_at DESC').all(caseId),
        relationships: db.prepare('SELECT * FROM relationships WHERE case_id=? ORDER BY last_seen_at DESC').all(caseId),
        findings: db.prepare('SELECT * FROM findings WHERE case_id=? ORDER BY created_at DESC LIMIT 1000').all(caseId),
        sources: summarizeSources(caseId),
        jobs: db.prepare('SELECT * FROM jobs WHERE case_id=? ORDER BY started_at DESC LIMIT 100').all(caseId),
        evidence: db.prepare('SELECT * FROM evidence WHERE case_id=? ORDER BY captured_at DESC').all(caseId)
      });
    }

    m = p.match(/^\/api\/cases\/([^/]+)\/subjects$/);
    if (m && req.method === 'POST') {
      const caseId = m[1];
      if (!caseExists(caseId)) return json(res, 404, { error: 'Case not found' });
      const b = await readJson(req);
      const type = cleanText(b.type, 20);
      const value = validateTarget(type, b.value);
      const label = cleanText(b.label, 160);
      const entityId = ensureSubjectEntity(caseId, type, value, label);
      const sid = id('subject');
      db.prepare('INSERT INTO subjects (id,case_id,type,value,label,created_at,canonical_entity_id) VALUES (?,?,?,?,?,?,?)')
        .run(sid, caseId, type, value, label, now(), entityId);
      db.prepare('UPDATE cases SET updated_at=? WHERE id=?').run(now(), caseId);
      audit({ caseId, action: 'subject.create', objectType: 'subject', objectId: sid, metadata: { type, entityId } });
      return json(res, 201, { subject: db.prepare('SELECT * FROM subjects WHERE id=?').get(sid), entityId });
    }

    m = p.match(/^\/api\/cases\/([^/]+)\/search$/);
    if (m && req.method === 'POST') {
      const caseId = m[1];
      if (!caseExists(caseId)) return json(res, 404, { error: 'Case not found' });
      const b = await readJson(req);
      const engine = cleanText(b.engine, 40);
      const targetType = cleanText(b.targetType, 20);
      const targetValue = validateTarget(targetType, b.targetValue);
      if (!engines[engine]) return json(res, 400, { error: 'Unknown engine' });
      if (!engines[engine].targetTypes.includes(targetType)) return json(res, 400, { error: 'Target type not supported by engine' });
      const jobId = createJob({ caseId, engine, targetType, targetValue, metadata: { mode: 'single' } });
      audit({ caseId, action: 'job.start', objectType: 'job', objectId: jobId, metadata: { engine, targetType } });
      setImmediate(() => startJob(jobId, caseId, engine, targetType, targetValue));
      return json(res, 202, { jobId, status: 'running' });
    }

    m = p.match(/^\/api\/cases\/([^/]+)\/trace$/);
    if (m && req.method === 'POST') {
      const caseId = m[1];
      if (!caseExists(caseId)) return json(res, 404, { error: 'Case not found' });
      const b = await readJson(req);
      const profile = cleanText(b.profile || 'standard', 20).toLowerCase();
      const targetType = cleanText(b.targetType, 20);
      const targetValue = validateTarget(targetType, b.targetValue);
      const plan = buildTracePlan({ profile, targetType, engines });
      const jobs = plan.scheduled.map((engine) => ({
        engine,
        jobId: createJob({ caseId, engine, targetType, targetValue, profile, metadata: { mode: 'trace', profile } })
      }));
      for (const job of jobs) setImmediate(() => startJob(job.jobId, caseId, job.engine, targetType, targetValue));
      audit({ caseId, action: 'trace.start', objectType: 'trace', metadata: { profile, targetType, jobs, skipped: plan.skipped } });
      return json(res, 202, { profile, targetType, targetValue, jobs, skipped: plan.skipped });
    }

    m = p.match(/^\/api\/jobs\/([^/]+)$/);
    if (m && req.method === 'GET') {
      const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(m[1]);
      return job ? json(res, 200, { job }) : json(res, 404, { error: 'Job not found' });
    }

    m = p.match(/^\/api\/cases\/([^/]+)\/evidence$/);
    if (m && req.method === 'POST') {
      const caseId = m[1];
      if (!caseExists(caseId)) return json(res, 404, { error: 'Case not found' });
      const b = await readJson(req);
      const evUrl = validateHttpUrl(b.url);
      const title = cleanText(b.title, 300);
      const notes = cleanText(b.notes, 5000);
      const findingId = cleanText(b.findingId, 100);
      const sourceId = cleanText(b.sourceId, 100);
      if (!validCaseObject('findings', caseId, findingId)) return json(res, 400, { error: 'Finding does not belong to case' });
      if (!validCaseObject('sources', caseId, sourceId)) return json(res, 400, { error: 'Source does not belong to case' });
      const provider = cleanText(b.provider, 80) || 'manual';
      const verificationStatus = cleanText(b.verificationStatus, 40) || 'observed';
      const query = b.query && typeof b.query === 'object' ? b.query : {};
      const raw = b.raw && typeof b.raw === 'object' ? b.raw : {};
      const normalized = b.normalized && typeof b.normalized === 'object' ? b.normalized : {};
      const headers = b.headers && typeof b.headers === 'object' ? b.headers : {};
      const contentSha256 = /^[a-f0-9]{64}$/i.test(String(b.contentSha256 || '')) ? String(b.contentSha256).toLowerCase() : '';
      const capturedAt = now();
      const canonical = {
        caseId, findingId, sourceId, url: evUrl, title, notes, provider,
        verificationStatus, query, raw, normalized, headers, contentSha256, capturedAt
      };
      const sha = hashRecord(canonical);
      const eid = id('evidence');
      db.prepare(`
        INSERT INTO evidence (
          id,case_id,url,title,notes,sha256,captured_at,finding_id,source_id,provider,
          query_json,raw_json,normalized_json,headers_json,content_sha256,verification_status
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        eid, caseId, evUrl, title, notes, sha, capturedAt, findingId, sourceId, provider,
        stableJson(query), stableJson(raw), stableJson(normalized), stableJson(headers), contentSha256, verificationStatus
      );
      audit({ caseId, action: 'evidence.create', objectType: 'evidence', objectId: eid, actor: cleanText(b.actor, 120) || 'analyst', metadata: { findingId, sourceId, provider, sha256: sha } });
      return json(res, 201, { evidence: db.prepare('SELECT * FROM evidence WHERE id=?').get(eid) });
    }

    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(await fs.readFile(path.join(publicDir, 'index.html')));
    }
    if (req.method === 'GET' && p === '/app.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      return res.end(await fs.readFile(path.join(publicDir, 'app.js')));
    }
    if (req.method === 'GET' && p === '/styles.css') {
      res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
      return res.end(await fs.readFile(path.join(publicDir, 'styles.css')));
    }
    return json(res, 404, { error: 'Not found' });
  } catch (e) {
    return json(res, e.status || 400, { error: e.message || 'Request failed' });
  }
}
