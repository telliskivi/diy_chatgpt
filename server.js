'use strict';

// Load .env if present (optional dependency)
try { require('dotenv').config(); } catch (_) {}

const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { initDb } = require('./src/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiters
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const RATE_LIMIT_STATIC = parseInt(process.env.RATE_LIMIT_STATIC || '300', 10);
const RATE_LIMIT_API = parseInt(process.env.RATE_LIMIT_API || '120', 10);
const staticLimiter = rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_STATIC, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_API, standardHeaders: true, legacyHeaders: false });

// Static files
app.use(staticLimiter, express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/chat', apiLimiter, require('./src/routes/chat'));
app.use('/api/backends', apiLimiter, require('./src/routes/backends'));
app.use('/api/projects', apiLimiter, require('./src/routes/projects'));
app.use('/api/conversations', apiLimiter, require('./src/routes/conversations'));
app.use('/api/upload', apiLimiter, require('./src/routes/upload'));

// Fallback: serve index.html for any non-API route
app.get('*', staticLimiter, (req, res) => {
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
