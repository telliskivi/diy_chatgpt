'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');

function serializeConversation(c, includeMessages = false) {
  let messages = [];
  try { messages = JSON.parse(c.messages || '[]'); } catch (_) {}
  const result = {
    id: c.id,
    project_id: c.project_id,
    title: c.title,
    provider_override: c.provider_override,
    model_override: c.model_override,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
  if (includeMessages) result.messages = messages;
  return result;
}

// GET /api/conversations
router.get('/', (req, res) => {
  try {
    const { projectId } = req.query;
    const convs = db.listConversations(projectId).map(c => serializeConversation(c, false));
    res.json(convs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/conversations
router.post('/', (req, res) => {
  try {
    const { project_id, title, provider_override, model_override } = req.body;
    const conv = db.createConversation({ project_id, title, provider_override, model_override });
    res.status(201).json(serializeConversation(conv, true));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/conversations/:id
router.put('/:id', (req, res) => {
  try {
    const { title, provider_override, model_override } = req.body;
    const conv = db.updateConversation(req.params.id, { title, provider_override, model_override });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    res.json(serializeConversation(conv, false));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/conversations/:id
router.delete('/:id', (req, res) => {
  try {
    db.deleteConversation(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/conversations/:id/messages
router.get('/:id/messages', (req, res) => {
  try {
    const conv = db.getConversation(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    let messages = [];
    try { messages = JSON.parse(conv.messages || '[]'); } catch (_) {}
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
