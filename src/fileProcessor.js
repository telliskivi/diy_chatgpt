'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Process an uploaded file and return normalized data.
 */
async function processFile(filePath, originalName, mimeType) {
  const ext = path.extname(originalName).toLowerCase();

  // Image types
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
    const data = fs.readFileSync(filePath);
    const base64 = data.toString('base64');
    return {
      type: 'image',
      base64,
      mimeType: mimeType || extToMime(ext),
      filename: originalName,
      size: data.length,
    };
  }

  // PDF
  if (ext === '.pdf') {
    try {
      const pdfParse = require('pdf-parse');
      const data = fs.readFileSync(filePath);
      const parsed = await pdfParse(data);
      return {
        type: 'text',
        content: parsed.text,
        filename: originalName,
        size: data.length,
      };
    } catch (e) {
      return {
        type: 'text',
        content: `[PDF parse error: ${e.message}]`,
        filename: originalName,
        size: 0,
      };
    }
  }

  // Text files
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return {
      type: 'text',
      content,
      filename: originalName,
      size: Buffer.byteLength(content),
    };
  } catch (e) {
    return {
      type: 'text',
      content: `[Error reading file: ${e.message}]`,
      filename: originalName,
      size: 0,
    };
  }
}

function extToMime(ext) {
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * Determines if a model supports vision (image input).
 */
function modelSupportsVision(model) {
  if (!model) return false;
  const m = model.toLowerCase();
  return (
    m.includes('gpt-4o') ||
    m.includes('gpt-4-turbo') ||
    m.includes('gpt-4-vision') ||
    m.includes('claude-3') ||
    m.includes('claude-opus') ||
    m.includes('claude-sonnet') ||
    m.includes('claude-haiku') ||
    m.includes('vision')
  );
}

module.exports = { processFile, modelSupportsVision };
