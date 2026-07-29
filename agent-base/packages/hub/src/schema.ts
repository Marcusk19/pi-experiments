import { DatabaseSync } from "node:sqlite";

export function databaseSizeBytes(database: DatabaseSync): number {
  const pages = database.prepare("PRAGMA page_count").get() as { page_count: number };
  const pageSize = database.prepare("PRAGMA page_size").get() as { page_size: number };
  return pages.page_count * pageSize.page_size;
}

export function createDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      metadata_json TEXT NOT NULL,
      state TEXT NOT NULL,
      latest_sequence INTEGER NOT NULL,
      last_activity_at INTEGER NOT NULL,
      lease_expires_at INTEGER NOT NULL,
      completeness TEXT NOT NULL DEFAULT 'complete',
      text_bytes INTEGER NOT NULL DEFAULT 0,
      task_capability_hash BLOB NOT NULL UNIQUE
    );
  `);
  database.exec(`
    CREATE TABLE events (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      searchable_text TEXT,
      text_bytes INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (session_id, event_id),
      UNIQUE (session_id, sequence)
    );
  `);
  database.exec(`
    CREATE VIRTUAL TABLE event_search USING fts5(
      session_id UNINDEXED,
      event_id UNINDEXED,
      body
    );
  `);
  database.exec("CREATE INDEX events_session_sequence ON events(session_id, sequence)");
  database.exec(`
    CREATE TABLE a2a_tasks (
      id TEXT PRIMARY KEY, instance_id TEXT NOT NULL, context_id TEXT NOT NULL,
      source_session_id TEXT NOT NULL, target_kind TEXT NOT NULL CHECK (target_kind IN ('session', 'worker')),
      target_selector_json TEXT NOT NULL, target_session_id TEXT,
      state TEXT NOT NULL CHECK (state IN ('submitted', 'working', 'completed', 'failed', 'canceled', 'rejected')),
      cancellation_requested INTEGER NOT NULL DEFAULT 0, source_closed INTEGER NOT NULL DEFAULT 0,
      deadline_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      terminal_code TEXT, content_bytes INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE a2a_messages (
      task_id TEXT NOT NULL REFERENCES a2a_tasks(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL, sequence INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('source', 'target')), parts_json TEXT NOT NULL,
      extensions_json TEXT NOT NULL, created_at INTEGER NOT NULL, content_bytes INTEGER NOT NULL,
      PRIMARY KEY (task_id, message_id), UNIQUE (task_id, sequence)
    );
    CREATE TABLE a2a_deliveries (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES a2a_tasks(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL, target_session_id TEXT NOT NULL, sequence INTEGER NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('queued', 'claimed', 'accepted', 'rejected', 'resolved')),
      claimed_at INTEGER, acknowledged_at INTEGER, UNIQUE (target_session_id, sequence)
    );
    CREATE INDEX a2a_tasks_source_updated ON a2a_tasks(source_session_id, updated_at DESC, id DESC);
    CREATE INDEX a2a_deliveries_target_queue ON a2a_deliveries(target_session_id, state, sequence);
    CREATE UNIQUE INDEX a2a_one_active_claim_per_target ON a2a_deliveries(target_session_id) WHERE state IN ('claimed', 'accepted');
    CREATE TABLE worker_launches (
      task_id TEXT PRIMARY KEY REFERENCES a2a_tasks(id) ON DELETE CASCADE, provider TEXT NOT NULL,
      launch_id TEXT, token_hash BLOB NOT NULL UNIQUE,
      state TEXT NOT NULL CHECK (state IN ('starting', 'started', 'bound', 'failed', 'canceled')),
      deadline_at INTEGER NOT NULL, bound_session_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX worker_launches_deadline ON worker_launches(state, deadline_at);
  `);
  return database;
}
