import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { db, id, now } from './db.mjs';
import { cleanText, validateTarget, validateHttpUrl } from './security/validation.mjs';
import { engines, runEngine } from './engines/registry.mjs';

const publicDir = path.resolve('public');
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };

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

function caseExists(caseId) { return !!db.prepare('SELECT id FROM cases WHERE id=?').get(caseId); }

async function startJob(jobId, caseId, engine, targetType, targetValue) {
  try {
    const findings = await runEngine(engine, targetType, targetValue);
    const insert = db.prepare('INSERT INTO findings (id,case_id,job_id,engine,kind,value,url,confidence,raw_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
    for (const f of findings.slice(0, 500)) {
      insert.run(id('finding'), caseId, jobId, engine, cleanText(f.kind,100), cleanText(String(f.value ?? ''),500), cleanText(f.url || '',2048), Number(f.confidence ?? 0.5), JSON.stringify(f.raw || {}), now());
    }
    db.prepare('UPDATE jobs SET status=?, finished_at=? WHERE id=?').run('complete', now(), jobId);
  } catch (e) {
    db.prepare('UPDATE jobs SET status=?, error=?, finished_at=? WHERE id=?').run('failed', cleanText(e.message,1000), now(), jobId);
  }
}

export async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && p === '/api/health') return json(res, 200, { ok: true, version: '0.1.0', engineMode: process.env.ENGINE_MODE || 'mock' });
    if (req.method === 'GET' && p === '/api/engines') return json(res, 200, { engines, spiderfootUrl: process.env.SPIDERFOOT_URL || '' });

    if (req.method === 'GET' && p === '/api/cases') {
      return json(res, 200, { cases: db.prepare('SELECT * FROM cases ORDER BY updated_at DESC').all() });
    }
    if (req.method === 'POST' && p === '/api/cases') {
      const body = await readJson(req); const title = cleanText(body.title,160); if (!title) return json(res,400,{error:'Title is required'});
      const caseId = id('case'); const ts = now();
      db.prepare('INSERT INTO cases (id,title,description,status,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(caseId,title,cleanText(body.description,2000),'open',ts,ts);
      return json(res, 201, { case: db.prepare('SELECT * FROM cases WHERE id=?').get(caseId) });
    }

    let m = p.match(/^\/api\/cases\/([^/]+)$/);
    if (m && req.method === 'GET') {
      const caseId = m[1]; const c = db.prepare('SELECT * FROM cases WHERE id=?').get(caseId); if (!c) return json(res,404,{error:'Case not found'});
      return json(res,200,{ case:c, subjects:db.prepare('SELECT * FROM subjects WHERE case_id=? ORDER BY created_at DESC').all(caseId), findings:db.prepare('SELECT * FROM findings WHERE case_id=? ORDER BY created_at DESC').all(caseId), jobs:db.prepare('SELECT * FROM jobs WHERE case_id=? ORDER BY started_at DESC LIMIT 100').all(caseId), evidence:db.prepare('SELECT * FROM evidence WHERE case_id=? ORDER BY captured_at DESC').all(caseId) });
    }

    m = p.match(/^\/api\/cases\/([^/]+)\/subjects$/);
    if (m && req.method === 'POST') {
      const caseId=m[1]; if(!caseExists(caseId)) return json(res,404,{error:'Case not found'}); const b=await readJson(req); const value=validateTarget(b.type,b.value); const sid=id('subject');
      db.prepare('INSERT INTO subjects (id,case_id,type,value,label,created_at) VALUES (?,?,?,?,?,?)').run(sid,caseId,b.type,value,cleanText(b.label,160),now());
      db.prepare('UPDATE cases SET updated_at=? WHERE id=?').run(now(),caseId);
      return json(res,201,{subject:db.prepare('SELECT * FROM subjects WHERE id=?').get(sid)});
    }

    m = p.match(/^\/api\/cases\/([^/]+)\/search$/);
    if (m && req.method === 'POST') {
      const caseId=m[1]; if(!caseExists(caseId)) return json(res,404,{error:'Case not found'}); const b=await readJson(req); const engine=cleanText(b.engine,40); const targetType=cleanText(b.targetType,20); const targetValue=validateTarget(targetType,b.targetValue);
      if(!engines[engine]) return json(res,400,{error:'Unknown engine'}); if(!engines[engine].targetTypes.includes(targetType)) return json(res,400,{error:'Target type not supported by engine'});
      const jobId=id('job'); db.prepare('INSERT INTO jobs (id,case_id,engine,target_type,target_value,status,started_at) VALUES (?,?,?,?,?,?,?)').run(jobId,caseId,engine,targetType,targetValue,'running',now());
      setImmediate(()=>startJob(jobId,caseId,engine,targetType,targetValue)); return json(res,202,{jobId,status:'running'});
    }

    m = p.match(/^\/api\/jobs\/([^/]+)$/);
    if (m && req.method === 'GET') { const job=db.prepare('SELECT * FROM jobs WHERE id=?').get(m[1]); return job?json(res,200,{job}):json(res,404,{error:'Job not found'}); }

    m = p.match(/^\/api\/cases\/([^/]+)\/evidence$/);
    if (m && req.method === 'POST') {
      const caseId=m[1]; if(!caseExists(caseId)) return json(res,404,{error:'Case not found'}); const b=await readJson(req); const evUrl=validateHttpUrl(b.url); const title=cleanText(b.title,300); const notes=cleanText(b.notes,5000); const capturedAt=now();
      const canonical=JSON.stringify({caseId,url:evUrl,title,notes,capturedAt}); const sha=createHash('sha256').update(canonical).digest('hex'); const eid=id('evidence');
      db.prepare('INSERT INTO evidence (id,case_id,url,title,notes,sha256,captured_at) VALUES (?,?,?,?,?,?,?)').run(eid,caseId,evUrl,title,notes,sha,capturedAt);
      return json(res,201,{evidence:db.prepare('SELECT * FROM evidence WHERE id=?').get(eid)});
    }

    if (req.method === 'GET' && (p === '/' || p === '/index.html')) { res.writeHead(200,{'content-type':'text/html; charset=utf-8'}); return res.end(await fs.readFile(path.join(publicDir,'index.html'))); }
    if (req.method === 'GET' && p === '/app.js') { res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'}); return res.end(await fs.readFile(path.join(publicDir,'app.js'))); }
    if (req.method === 'GET' && p === '/styles.css') { res.writeHead(200,{'content-type':'text/css; charset=utf-8'}); return res.end(await fs.readFile(path.join(publicDir,'styles.css'))); }
    return json(res,404,{error:'Not found'});
  } catch (e) { return json(res,e.status||400,{error:e.message||'Request failed'}); }
}
