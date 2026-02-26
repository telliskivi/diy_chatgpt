'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { encrypt, decrypt } = require('../crypto');
const openai = require('../providers/openai');

// Mask API key for display
function maskKey(key) {
  if (!key) return '';
  return key.slice(0, 4) + '...' + (key.length > 8 ? key.slice(-4) : '');
}

function serializeBackend(b) {
  let models = [];
  try { models = JSON.parse(b.models || '[]'); } catch (_) {}
  const decrypted = decrypt(b.api_key_encrypted || '');
  return {
    id: b.id,
    name: b.name,
    provider_type: b.provider_type,
    base_url: b.base_url,
    api_key_masked: maskKey(decrypted),
    models,
    is_default: !!b.is_default,
    created_at: b.created_at,
  };
}

// GET /api/backends
router.get('/', (req, res) => {
  try {
    const backends = db.listBackends().map(serializeBackend);
    res.json(backends);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backends
router.post('/', (req, res) => {
  try {
    const { name, provider_type, base_url, api_key, models, is_default } = req.body;
    if (!name || !provider_type || !base_url) {
      return res.status(400).json({ error: 'name, provider_type, and base_url are required' });
    }
    const backend = db.createBackend({
      name,
      provider_type,
      base_url,
      api_key_encrypted: api_key ? encrypt(api_key) : '',
      models: models || [],
      is_default: !!is_default,
    });
    res.status(201).json(serializeBackend(backend));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/backends/:id
router.put('/:id', (req, res) => {
  try {
    const { name, provider_type, base_url, api_key, models, is_default } = req.body;
    const data = { name, provider_type, base_url, models, is_default };
    if (api_key && api_key !== '***') {
      data.api_key_encrypted = encrypt(api_key);
    }
    const backend = db.updateBackend(req.params.id, data);
    if (!backend) return res.status(404).json({ error: 'Backend not found' });
    res.json(serializeBackend(backend));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/backends/:id
router.delete('/:id', (req, res) => {
  try {
    db.deleteBackend(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backends/:id/test
router.post('/:id/test', async (req, res) => {
  try {
    const backend = db.getBackend(req.params.id);
    if (!backend) return res.status(404).json({ error: 'Backend not found' });

    // Try fetching models as a test
    if (backend.provider_type === 'openai') {
      try {
        const models = await openai.fetchModels(backend);
        return res.json({ success: true, models });
      } catch (e) {
        return res.json({ success: false, error: e.message });
      }
    } else {
      // For Anthropic, just return success (we can't easily test without a real request)
      return res.json({ success: true, message: 'Anthropic backend configured (test not available without real request)' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backends/:id/models
router.get('/:id/models', async (req, res) => {
  try {
    const backend = db.getBackend(req.params.id);
    if (!backend) return res.status(404).json({ error: 'Backend not found' });

    if (backend.provider_type === 'openai') {
      try {
        const models = await openai.fetchModels(backend);
        // Update stored models
        db.updateBackend(backend.id, { models });
        return res.json({ models });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    } else {
      let models = [];
      try { models = JSON.parse(backend.models || '[]'); } catch (_) {}
      return res.json({ models });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
