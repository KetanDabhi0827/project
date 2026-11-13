const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const config = require('../config');

// Ensure database directory exists
const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Ensure uploads directory exists
if (!fs.existsSync(config.uploadsDir)) {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
}

let dbInstance = null;

function getDatabase(dbFilePath = config.dbPath) {
  if (dbInstance) {
    return dbInstance;
  }

  const isMemory = dbFilePath === ':memory:';
  const db = new sqlite3.Database(dbFilePath, (err) => {
    if (err) {
      console.error('[DB] Failed to open SQLite database:', err.message);
    }
  });

  // Enable WAL mode (Write-Ahead Logging) for disk databases to handle concurrent read/writes
  if (!isMemory) {
    db.run('PRAGMA journal_mode = WAL;');
  }
  db.run('PRAGMA foreign_keys = ON;');

  dbInstance = db;
  return db;
}

function initSchema(db = getDatabase()) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 1. Visitors table
      db.run(`
        CREATE TABLE IF NOT EXISTS visitors (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          normalized_name TEXT NOT NULL,
          identifier TEXT NOT NULL,
          pin TEXT NOT NULL,
          consent_given INTEGER NOT NULL DEFAULT 1,
          consent_timestamp TEXT NOT NULL,
          visit_count INTEGER NOT NULL DEFAULT 1,
          first_visited_at TEXT NOT NULL,
          last_visited_at TEXT NOT NULL
        )
      `, (err) => {
        if (err) return reject(err);
      });

      // Index for fast visitor lookup
      db.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_visitors_lookup
        ON visitors(normalized_name, identifier)
      `);

      // 2. Photos table
      db.run(`
        CREATE TABLE IF NOT EXISTS photos (
          id TEXT PRIMARY KEY,
          visitor_id TEXT NOT NULL,
          filename TEXT NOT NULL,
          original_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          visit_batch_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT,
          FOREIGN KEY (visitor_id) REFERENCES visitors(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) return reject(err);
      });

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_photos_visitor
        ON photos(visitor_id, is_active)
      `);

      // 3. Privacy & Consent Audit Log
      db.run(`
        CREATE TABLE IF NOT EXISTS consent_logs (
          id TEXT PRIMARY KEY,
          visitor_id TEXT,
          action TEXT NOT NULL,
          ip_hash TEXT,
          timestamp TEXT NOT NULL,
          details TEXT
        )
      `);

      // 4. Runtime Settings (e.g. dynamic slide duration)
      db.run(`
        CREATE TABLE IF NOT EXISTS slideshow_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `, (err) => {
        if (err) return reject(err);

        // Seed default slide duration if not present
        db.run(
          `INSERT OR IGNORE INTO slideshow_settings (key, value) VALUES ('slide_duration', ?)`,
          [config.slideDurationSeconds.toString()],
          (seedErr) => {
            if (seedErr) return reject(seedErr);
            resolve(db);
          }
        );
      });
    });
  });
}

function runAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function allAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function closeDatabase() {
  return new Promise((resolve, reject) => {
    if (!dbInstance) return resolve();
    dbInstance.close((err) => {
      if (err) return reject(err);
      dbInstance = null;
      resolve();
    });
  });
}

module.exports = {
  getDatabase,
  initSchema,
  runAsync,
  getAsync,
  allAsync,
  closeDatabase,
};
