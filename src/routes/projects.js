'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');

function serializeProject(p) {
  let enabled_tools = [];
  try { enabled_tools = JSON.parse(p.enabled_tools || '[]'); } catch (_) {}
  return { ...p, enabled_tools };
}

// GET /api/projects
router.get('/', (req, res) => {
  try {
    res.json(db.listProjects().map(serializeProject));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects
router.post('/', (req, res) => {
  try {
    const { name, system_prompt, default_backend_id, default_model, enabled_tools } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const project = db.createProject({ name, system_prompt, default_backend_id, default_model, enabled_tools });
    res.status(201).json(serializeProject(project));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/projects/:id
router.put('/:id', (req, res) => {
  try {
    const { name, system_prompt, default_backend_id, default_model, enabled_tools } = req.body;
    const project = db.updateProject(req.params.id, { name, system_prompt, default_backend_id, default_model, enabled_tools });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(serializeProject(project));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id
router.delete('/:id', (req, res) => {
  try {
    const project = db.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.name === 'Default') return res.status(400).json({ error: 'Cannot delete the default project' });
    db.deleteProject(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
