import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const dataDir = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(dataDir, { recursive: true });
export const db = new DatabaseSync(path.join(dataDir, 'nightglass.db'));

db.exec(`
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  engine TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_value TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  engine TEXT NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0.5,
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  sha256 TEXT NOT NULL,
  captured_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  canonical_value TEXT NOT NULL,
  display_value TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0.5,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(case_id, type, canonical_value)
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  finding_id TEXT REFERENCES findings(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'provider',
  source_url TEXT NOT NULL DEFAULT '',
  query_json TEXT NOT NULL DEFAULT '{}',
  raw_json TEXT NOT NULL DEFAULT '{}',
  retrieved_at TEXT NOT NULL,
  sha256 TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  from_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  source_confidence REAL NOT NULL DEFAULT 0.5,
  match_confidence REAL NOT NULL DEFAULT 0.5,
  correlation_confidence REAL NOT NULL DEFAULT 0.5,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(case_id, from_entity_id, to_entity_id, type)
);

CREATE TABLE IF NOT EXISTS relationship_sources (
  relationship_id TEXT NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  PRIMARY KEY (relationship_id, source_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT 'system',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

function existingColumns(table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
}

function ensureColumn(table, definition) {
  const column = definition.trim().split(/\s+/)[0];
  if (!existingColumns(table).has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

// Additive migrations from the original v0.1 schema. Never destroy existing case data.
ensureColumn('subjects', "canonical_entity_id TEXT NOT NULL DEFAULT ''");
ensureColumn('jobs', "profile TEXT NOT NULL DEFAULT ''");
ensureColumn('jobs', "metadata_json TEXT NOT NULL DEFAULT '{}'");

ensureColumn('findings', "entity_id TEXT NOT NULL DEFAULT ''");
ensureColumn('findings', 'source_confidence REAL NOT NULL DEFAULT 0.5');
ensureColumn('findings', 'match_confidence REAL NOT NULL DEFAULT 0.5');
ensureColumn('findings', 'correlation_confidence REAL NOT NULL DEFAULT 0.5');
ensureColumn('findings', 'freshness REAL NOT NULL DEFAULT 0.5');
ensureColumn('findings', "verification_status TEXT NOT NULL DEFAULT 'unverified'");
ensureColumn('findings', "normalized_json TEXT NOT NULL DEFAULT '{}'");

ensureColumn('evidence', "finding_id TEXT NOT NULL DEFAULT ''");
ensureColumn('evidence', "source_id TEXT NOT NULL DEFAULT ''");
ensureColumn('evidence', "provider TEXT NOT NULL DEFAULT 'manual'");
ensureColumn('evidence', "query_json TEXT NOT NULL DEFAULT '{}'");
ensureColumn('evidence', "raw_json TEXT NOT NULL DEFAULT '{}'");
ensureColumn('evidence', "normalized_json TEXT NOT NULL DEFAULT '{}'");
ensureColumn('evidence', "headers_json TEXT NOT NULL DEFAULT '{}'");
ensureColumn('evidence', "content_sha256 TEXT NOT NULL DEFAULT ''");
ensureColumn('evidence', "verification_status TEXT NOT NULL DEFAULT 'observed'");
ensureColumn('evidence', "capture_id TEXT NOT NULL DEFAULT ''");
ensureColumn('evidence', "snapshot_ref TEXT NOT NULL DEFAULT ''");
ensureColumn('evidence', "screenshot_ref TEXT NOT NULL DEFAULT ''");

ensureColumn('relationships', "reviewed_at TEXT NOT NULL DEFAULT ''");
ensureColumn('relationships', "reviewed_by TEXT NOT NULL DEFAULT ''");
ensureColumn('relationships', "review_notes TEXT NOT NULL DEFAULT ''");

const indexes = [
  'CREATE INDEX IF NOT EXISTS idx_subjects_case ON subjects(case_id)',
  'CREATE INDEX IF NOT EXISTS idx_findings_case ON findings(case_id)',
  'CREATE INDEX IF NOT EXISTS idx_findings_entity ON findings(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_jobs_case ON jobs(case_id)',
  'CREATE INDEX IF NOT EXISTS idx_evidence_case ON evidence(case_id)',
  'CREATE INDEX IF NOT EXISTS idx_entities_case ON entities(case_id)',
  'CREATE INDEX IF NOT EXISTS idx_sources_case ON sources(case_id)',
  'CREATE INDEX IF NOT EXISTS idx_sources_finding ON sources(finding_id)',
  'CREATE INDEX IF NOT EXISTS idx_relationships_case ON relationships(case_id)',
  'CREATE INDEX IF NOT EXISTS idx_audit_case ON audit_log(case_id)'
];
for (const sql of indexes) db.exec(sql);

db.prepare(`
  INSERT INTO schema_meta (key, value) VALUES ('schema_version', '2')
  ON CONFLICT(key) DO UPDATE SET value=excluded.value
`).run();

export const now = () => new Date().toISOString();
export const id = (prefix) => `${prefix}_${randomUUID()}`;

export function audit({ caseId = null, action, objectType, objectId = '', actor = 'system', metadata = {} }) {
  db.prepare(`
    INSERT INTO audit_log (id,case_id,action,object_type,object_id,actor,metadata_json,created_at)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(id('audit'), caseId, action, objectType, objectId, actor, JSON.stringify(metadata ?? {}), now());
}
