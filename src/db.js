'use strict';

const crypto = require('crypto');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'app.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS backends (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider_type TEXT NOT NULL CHECK(provider_type IN ('openai','anthropic')),
      base_url TEXT NOT NULL,
      api_key_encrypted TEXT,
      models TEXT DEFAULT '[]',
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      system_prompt TEXT DEFAULT '',
      default_backend_id TEXT,
      default_model TEXT,
      enabled_tools TEXT DEFAULT '[]',
      file_path TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT DEFAULT 'New Conversation',
      messages TEXT DEFAULT '[]',
      provider_override TEXT,
      model_override TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT 'default',
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      done INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT 'default',
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      start_time TEXT,
      end_time TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed default project if not exists
  const existing = db.prepare('SELECT id FROM projects WHERE name = ?').get('Default');
  if (!existing) {
    const ALL_TOOLS = [
      'get_datetime','web_search','web_fetch',
      'todo_list','todo_create','todo_update','todo_delete',
      'calendar_list','calendar_create','calendar_update','calendar_delete'
    ];
    db.prepare(`
      INSERT INTO projects (id, name, system_prompt, enabled_tools)
      VALUES (?, 'Default', '', ?)
    `).run(randomId(), JSON.stringify(ALL_TOOLS));
  }

  return db;
}

function randomId() {
  return crypto.randomUUID();
}

// ── Backends ──────────────────────────────────────────────────────────────────

function listBackends() {
  return getDb().prepare('SELECT * FROM backends ORDER BY created_at ASC').all();
}

function getBackend(id) {
  return getDb().prepare('SELECT * FROM backends WHERE id = ?').get(id);
}

function getDefaultBackend() {
  return getDb().prepare('SELECT * FROM backends WHERE is_default = 1 LIMIT 1').get()
    || getDb().prepare('SELECT * FROM backends ORDER BY created_at ASC LIMIT 1').get();
}

function createBackend(data) {
  const id = randomId();
  getDb().prepare(`
    INSERT INTO backends (id, name, provider_type, base_url, api_key_encrypted, models, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.provider_type, data.base_url,
         data.api_key_encrypted || '', JSON.stringify(data.models || []), data.is_default ? 1 : 0);
  if (data.is_default) {
    getDb().prepare('UPDATE backends SET is_default = 0 WHERE id != ?').run(id);
  }
  return getDb().prepare('SELECT * FROM backends WHERE id = ?').get(id);
}

function updateBackend(id, data) {
  const fields = [];
  const vals = [];
  if (data.name !== undefined) { fields.push('name = ?'); vals.push(data.name); }
  if (data.provider_type !== undefined) { fields.push('provider_type = ?'); vals.push(data.provider_type); }
  if (data.base_url !== undefined) { fields.push('base_url = ?'); vals.push(data.base_url); }
  if (data.api_key_encrypted !== undefined) { fields.push('api_key_encrypted = ?'); vals.push(data.api_key_encrypted); }
  if (data.models !== undefined) { fields.push('models = ?'); vals.push(JSON.stringify(data.models)); }
  if (data.is_default !== undefined) { fields.push('is_default = ?'); vals.push(data.is_default ? 1 : 0); }
  if (!fields.length) return getBackend(id);
  vals.push(id);
  getDb().prepare(`UPDATE backends SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  if (data.is_default) {
    getDb().prepare('UPDATE backends SET is_default = 0 WHERE id != ?').run(id);
  }
  return getDb().prepare('SELECT * FROM backends WHERE id = ?').get(id);
}

function deleteBackend(id) {
  return getDb().prepare('DELETE FROM backends WHERE id = ?').run(id);
}

// ── Projects ──────────────────────────────────────────────────────────────────

function listProjects() {
  return getDb().prepare('SELECT * FROM projects ORDER BY created_at ASC').all();
}

function getProject(id) {
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

function createProject(data) {
  const id = randomId();
  getDb().prepare(`
    INSERT INTO projects (id, name, system_prompt, default_backend_id, default_model, enabled_tools)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.system_prompt || '', data.default_backend_id || null,
         data.default_model || null, JSON.stringify(data.enabled_tools || []));
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

function updateProject(id, data) {
  const fields = [];
  const vals = [];
  if (data.name !== undefined) { fields.push('name = ?'); vals.push(data.name); }
  if (data.system_prompt !== undefined) { fields.push('system_prompt = ?'); vals.push(data.system_prompt); }
  if (data.default_backend_id !== undefined) { fields.push('default_backend_id = ?'); vals.push(data.default_backend_id); }
  if (data.default_model !== undefined) { fields.push('default_model = ?'); vals.push(data.default_model); }
  if (data.enabled_tools !== undefined) { fields.push('enabled_tools = ?'); vals.push(JSON.stringify(data.enabled_tools)); }
  if (!fields.length) return getProject(id);
  vals.push(id);
  getDb().prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

function deleteProject(id) {
  return getDb().prepare('DELETE FROM projects WHERE id = ?').run(id);
}

// ── Conversations ─────────────────────────────────────────────────────────────

function listConversations(projectId) {
  if (projectId) {
    return getDb().prepare('SELECT * FROM conversations WHERE project_id = ? ORDER BY updated_at DESC').all(projectId);
  }
  return getDb().prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all();
}

function getConversation(id) {
  return getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id);
}

function createConversation(data) {
  const id = randomId();
  getDb().prepare(`
    INSERT INTO conversations (id, project_id, title, messages, provider_override, model_override)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.project_id || null, data.title || 'New Conversation',
         JSON.stringify(data.messages || []), data.provider_override || null, data.model_override || null);
  return getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id);
}

function updateConversation(id, data) {
  const fields = ['updated_at = datetime(\'now\')'];
  const vals = [];
  if (data.title !== undefined) { fields.push('title = ?'); vals.push(data.title); }
  if (data.messages !== undefined) { fields.push('messages = ?'); vals.push(JSON.stringify(data.messages)); }
  if (data.provider_override !== undefined) { fields.push('provider_override = ?'); vals.push(data.provider_override); }
  if (data.model_override !== undefined) { fields.push('model_override = ?'); vals.push(data.model_override); }
  vals.push(id);
  getDb().prepare(`UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  return getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id);
}

function deleteConversation(id) {
  return getDb().prepare('DELETE FROM conversations WHERE id = ?').run(id);
}

// ── Todos ─────────────────────────────────────────────────────────────────────

function listTodos(userId = 'default') {
  return getDb().prepare('SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

function createTodo(data, userId = 'default') {
  const id = randomId();
  getDb().prepare(`
    INSERT INTO todos (id, user_id, title, description)
    VALUES (?, ?, ?, ?)
  `).run(id, userId, data.title, data.description || '');
  return getDb().prepare('SELECT * FROM todos WHERE id = ?').get(id);
}

function updateTodo(id, data, userId = 'default') {
  const fields = ['updated_at = datetime(\'now\')'];
  const vals = [];
  if (data.title !== undefined) { fields.push('title = ?'); vals.push(data.title); }
  if (data.description !== undefined) { fields.push('description = ?'); vals.push(data.description); }
  if (data.done !== undefined) { fields.push('done = ?'); vals.push(data.done ? 1 : 0); }
  vals.push(id, userId);
  getDb().prepare(`UPDATE todos SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
  return getDb().prepare('SELECT * FROM todos WHERE id = ?').get(id);
}

function deleteTodo(id, userId = 'default') {
  return getDb().prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(id, userId);
}

// ── Calendar Events ───────────────────────────────────────────────────────────

function listCalendarEvents(userId = 'default', start, end) {
  if (start && end) {
    return getDb().prepare(
      'SELECT * FROM calendar_events WHERE user_id = ? AND start_time >= ? AND start_time <= ? ORDER BY start_time ASC'
    ).all(userId, start, end);
  }
  return getDb().prepare('SELECT * FROM calendar_events WHERE user_id = ? ORDER BY start_time ASC').all(userId);
}

function createCalendarEvent(data, userId = 'default') {
  const id = randomId();
  getDb().prepare(`
    INSERT INTO calendar_events (id, user_id, title, description, start_time, end_time)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, data.title, data.description || '', data.start_time || null, data.end_time || null);
  return getDb().prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
}

function updateCalendarEvent(id, data, userId = 'default') {
  const fields = ['updated_at = datetime(\'now\')'];
  const vals = [];
  if (data.title !== undefined) { fields.push('title = ?'); vals.push(data.title); }
  if (data.description !== undefined) { fields.push('description = ?'); vals.push(data.description); }
  if (data.start_time !== undefined) { fields.push('start_time = ?'); vals.push(data.start_time); }
  if (data.end_time !== undefined) { fields.push('end_time = ?'); vals.push(data.end_time); }
  vals.push(id, userId);
  getDb().prepare(`UPDATE calendar_events SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
  return getDb().prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
}

function deleteCalendarEvent(id, userId = 'default') {
  return getDb().prepare('DELETE FROM calendar_events WHERE id = ? AND user_id = ?').run(id, userId);
}

module.exports = {
  initDb,
  getDb,
  randomId,
  // Backends
  listBackends, getBackend, getDefaultBackend, createBackend, updateBackend, deleteBackend,
  // Projects
  listProjects, getProject, createProject, updateProject, deleteProject,
  // Conversations
  listConversations, getConversation, createConversation, updateConversation, deleteConversation,
  // Todos
  listTodos, createTodo, updateTodo, deleteTodo,
  // Calendar
  listCalendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent,
};
