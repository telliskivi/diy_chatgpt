'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Make an HTTPS/HTTP request and return a promise of the response object.
 */
function makeRequest(urlStr, options, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const reqOptions = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: options.method || 'POST',
      headers: options.headers || {},
    };
    const req = lib.request(reqOptions, (res) => resolve(res));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Stream chat completions from an OpenAI-compatible endpoint.
 */
async function streamChat(backend, model, messages, tools, onChunk, onDone, onError) {
  const { decrypt } = require('../crypto');
  const apiKey = decrypt(backend.api_key_encrypted);
  const baseUrl = backend.base_url.replace(/\/$/, '');

  const body = JSON.stringify({
    model,
    messages,
    stream: true,
    ...(tools && tools.length > 0 ? {
      tools: tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters || { type: 'object', properties: {} },
        }
      })),
      tool_choice: 'auto',
    } : {}),
  });

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'Content-Length': Buffer.byteLength(body),
  };

  let res;
  try {
    res = await makeRequest(`${baseUrl}/v1/chat/completions`, { method: 'POST', headers }, body);
  } catch (err) {
    onError(err);
    return;
  }

  if (res.statusCode !== 200) {
    let errBody = '';
    res.on('data', d => { errBody += d; });
    res.on('end', () => {
      onError(new Error(`OpenAI API error ${res.statusCode}: ${errBody}`));
    });
    return;
  }

  let buffer = '';
  let fullText = '';
  // Tool calls are accumulated as a map of index -> { id, name, arguments }
  const toolCallMap = {};

  res.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // last element might be incomplete

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(dataStr);
        const delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
        if (!delta) continue;

        if (delta.content) {
          fullText += delta.content;
          onChunk(delta.content);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index !== undefined ? tc.index : 0;
            if (!toolCallMap[idx]) toolCallMap[idx] = { id: '', name: '', arguments: '' };
            if (tc.id) toolCallMap[idx].id += tc.id;
            if (tc.function) {
              if (tc.function.name) toolCallMap[idx].name += tc.function.name;
              if (tc.function.arguments) toolCallMap[idx].arguments += tc.function.arguments;
            }
          }
        }
      } catch (_) { /* ignore parse errors */ }
    }
  });

  res.on('end', () => {
    const toolCalls = Object.values(toolCallMap).filter(tc => tc.name);
    onDone(toolCalls.length > 0 ? 'tool_calls' : 'stop', toolCalls, fullText);
  });

  res.on('error', onError);
}

/**
 * Fetch available models from an OpenAI-compatible endpoint.
 */
async function fetchModels(backend) {
  const { decrypt } = require('../crypto');
  const apiKey = decrypt(backend.api_key_encrypted);
  const baseUrl = backend.base_url.replace(/\/$/, '');

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
  };

  return new Promise((resolve, reject) => {
    const u = new URL(`${baseUrl}/v1/models`);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'GET',
      headers,
    }, (res) => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const models = (parsed.data || []).map(m => m.id).sort();
          resolve(models);
        } catch (e) {
          reject(new Error(`Failed to parse models: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = { streamChat, fetchModels };
