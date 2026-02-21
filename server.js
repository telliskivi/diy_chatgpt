'use strict';

// Load .env if present (optional dependency)
try { require('dotenv').config(); } catch (_) {}

const express = require('express');
const path = require('path');
const { initDb } = require('./src/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/chat', require('./src/routes/chat'));
app.use('/api/backends', require('./src/routes/backends'));
app.use('/api/projects', require('./src/routes/projects'));
app.use('/api/conversations', require('./src/routes/conversations'));
app.use('/api/upload', require('./src/routes/upload'));

// Fallback: serve index.html for any non-API route
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Initialize DB then start server
try {
  initDb();
  console.log('Database initialized');
} catch (err) {
  console.error('Failed to initialize database:', err);
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
