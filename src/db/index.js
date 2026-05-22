/**
 * db.js — thin wrapper around sql.js
 *
 * sql.js runs SQLite entirely in JavaScript (WASM) — no native bindings needed.
 * The database is loaded from disk on startup and saved back on every write.
 *
 * Public API:
 *   db.all(sql, params?)   → array of row objects
 *   db.get(sql, params?)   → single row object or undefined
 *   db.run(sql, params?)   → { changes, lastInsertRowid }
 *   db.save()              → writes current DB state to disk
 *   db.init()              → must be called once at startup (async)
 */

const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/roommate.sqlite')
// const DB_PATH = path.join(__dirname, '../../data/roommate.sqlite')
const DATA_DIR = path.dirname(DB_PATH)

let _db = null // sql.js Database instance

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const SQL = await initSqlJs()

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH)
    _db = new SQL.Database(fileBuffer)
  } else {
    _db = new SQL.Database()
  }

  _applySchema()
  _seedDefaults()
  save()
}

// ─── Schema ───────────────────────────────────────────────────────────────────

function _applySchema() {
  _db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  _db.run(`
    CREATE TABLE IF NOT EXISTS members (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      pin        TEXT NOT NULL,
      colorIdx   INTEGER NOT NULL DEFAULT 0,
      createdAt  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  _db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id           TEXT PRIMARY KEY,
      memberId     TEXT NOT NULL,
      memberName   TEXT NOT NULL,
      type         TEXT NOT NULL CHECK(type IN ('credit','debit')),
      amount       REAL NOT NULL CHECK(amount > 0),
      note         TEXT,
      status       TEXT NOT NULL DEFAULT 'pending'
                       CHECK(status IN ('pending','approved','rejected')),
      initiatedBy  TEXT NOT NULL DEFAULT 'self'
                       CHECK(initiatedBy IN ('self','captain')),
      createdAt    TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (memberId) REFERENCES members(id)
    )
  `)
}

function _seedDefaults() {
  const row = get('SELECT value FROM settings WHERE key = ?', ['captainPin'])
  if (!row) {
    run('INSERT INTO settings (key, value) VALUES (?, ?)', ['captainPin', '0000'])
    console.log("  ✓ Captain PIN seeded as '0000' — change via the API if needed.")
  }
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function save() {
  if (!_db) throw new Error('Database not initialised.')
  const data = _db.export()
  fs.writeFileSync(DB_PATH, Buffer.from(data))
}

// ─── Query helpers ────────────────────────────────────────────────────────────

/**
 * Execute a SELECT and return all rows as plain objects.
 */
function all(sql, params = []) {
  _assertReady()
  const stmt = _db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

/**
 * Execute a SELECT and return the first row, or undefined.
 */
function get(sql, params = []) {
  const rows = all(sql, params)
  return rows[0]
}

/**
 * Execute an INSERT / UPDATE / DELETE.
 * Automatically saves to disk after every write.
 */
function run(sql, params = []) {
  _assertReady()
  _db.run(sql, params)
  save()
  // sql.js doesn't expose lastInsertRowid or changes directly,
  // so we return a sentinel — callers rely on the data they inserted, not this.
  return { ok: true }
}

function _assertReady() {
  if (!_db) throw new Error('Database not initialised. Call db.init() first.')
}

module.exports = { init, all, get, run, save }
