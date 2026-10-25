/** Equivalent to db/schema.ts in the original NexusHub, including every index. */
export const STORAGE_SCHEMA = `
CREATE TABLE IF NOT EXISTS entries (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
 summary TEXT NOT NULL DEFAULT '', module TEXT NOT NULL, category TEXT NOT NULL,
 kind TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]', origin TEXT NOT NULL DEFAULT 'local',
 source_path TEXT, source_sha TEXT, content_hash TEXT, state TEXT NOT NULL DEFAULT 'klar',
 version INTEGER NOT NULL DEFAULT 1, favorite INTEGER NOT NULL DEFAULT 0,
 deleted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entry_module ON entries(module);
CREATE INDEX IF NOT EXISTS entry_category ON entries(category);
CREATE INDEX IF NOT EXISTS entry_updated ON entries(updated_at);
CREATE INDEX IF NOT EXISTS entry_state ON entries(state);
CREATE TABLE IF NOT EXISTS files (
 id TEXT PRIMARY KEY, entry_id TEXT, name TEXT NOT NULL, key TEXT NOT NULL,
 mime TEXT NOT NULL, size INTEGER NOT NULL, hash TEXT NOT NULL, origin TEXT NOT NULL,
 source_path TEXT, source_sha TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS file_entry ON files(entry_id);
CREATE UNIQUE INDEX IF NOT EXISTS file_path ON files(source_path);
CREATE TABLE IF NOT EXISTS relations (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES entries(id),
 target_id TEXT NOT NULL REFERENCES entries(id), type TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_relation ON relations(source_id,target_id,type);
CREATE TABLE IF NOT EXISTS versions (
 id TEXT PRIMARY KEY, entry_id TEXT NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS versions_entry ON versions(entry_id);
CREATE TABLE IF NOT EXISTS activity (
 id TEXT PRIMARY KEY, entry_id TEXT, title TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mirror_versions (
 repo TEXT NOT NULL, path TEXT NOT NULL, blob_sha TEXT NOT NULL, commit_sha TEXT NOT NULL,
 object_key TEXT NOT NULL, content_hash TEXT NOT NULL, size INTEGER NOT NULL,
 document TEXT NOT NULL, body TEXT NOT NULL, text_indexed INTEGER NOT NULL, verified_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS mirror_version_key ON mirror_versions(repo,path,blob_sha);
CREATE INDEX IF NOT EXISTS mirror_path ON mirror_versions(repo,path);
PRAGMA user_version = 1;
`;
