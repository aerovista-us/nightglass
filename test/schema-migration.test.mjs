import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('schema v2 additively upgrades a v0.1 database', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'nightglass-v01-'));
  const legacy = new DatabaseSync(path.join(dir, 'nightglass.db'));
  legacy.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE cases (id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE subjects (id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,type TEXT NOT NULL,value TEXT NOT NULL,label TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
    CREATE TABLE jobs (id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,engine TEXT NOT NULL,target_type TEXT NOT NULL,target_value TEXT NOT NULL,status TEXT NOT NULL,error TEXT NOT NULL DEFAULT '',started_at TEXT NOT NULL,finished_at TEXT);
    CREATE TABLE findings (id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,engine TEXT NOT NULL,kind TEXT NOT NULL,value TEXT NOT NULL,url TEXT NOT NULL DEFAULT '',confidence REAL NOT NULL DEFAULT 0.5,raw_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL);
    CREATE TABLE evidence (id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,url TEXT NOT NULL,title TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',sha256 TEXT NOT NULL,captured_at TEXT NOT NULL);
  `);
  legacy.prepare('INSERT INTO cases VALUES (?,?,?,?,?,?)').run('case_legacy','Legacy Case','must survive','open','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
  legacy.prepare('INSERT INTO subjects VALUES (?,?,?,?,?,?)').run('subject_legacy','case_legacy','username','legacy_user','Legacy','2026-01-01T00:00:00Z');
  legacy.close();

  process.env.DATA_DIR = dir;
  const migrated = await import(`../src/db.mjs?migration=${Date.now()}`);
  const row = migrated.db.prepare('SELECT * FROM cases WHERE id=?').get('case_legacy');
  assert.equal(row.title, 'Legacy Case');
  assert.equal(migrated.db.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get().value, '2');
  const subjectColumns = new Set(migrated.db.prepare('PRAGMA table_info(subjects)').all().map((x) => x.name));
  const findingColumns = new Set(migrated.db.prepare('PRAGMA table_info(findings)').all().map((x) => x.name));
  assert.ok(subjectColumns.has('canonical_entity_id'));
  assert.ok(findingColumns.has('normalized_json'));
  assert.ok(findingColumns.has('source_confidence'));
  assert.equal(migrated.db.prepare('SELECT COUNT(*) AS n FROM subjects WHERE case_id=?').get('case_legacy').n, 1);
  migrated.db.close();
});
