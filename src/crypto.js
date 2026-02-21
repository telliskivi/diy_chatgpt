'use strict';

const crypto = require('crypto');

const ENCRYPTION_KEY_RAW = process.env.ENCRYPTION_KEY || (() => {
  if (process.env.NODE_ENV === 'production') {
    console.warn('[WARN] ENCRYPTION_KEY is not set. Using insecure default key. Set ENCRYPTION_KEY in production!');
  }
  return 'diy-chatgpt-dev-key-32chars-here!!';
})();
// Derive a 32-byte key using SHA-256
const ENCRYPTION_KEY = crypto.createHash('sha256').update(ENCRYPTION_KEY_RAW).digest();
const IV_LENGTH = 16;

function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  if (!text) return '';
  try {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return text; // return as-is if decrypt fails (plain text key)
  }
}

module.exports = { encrypt, decrypt };
