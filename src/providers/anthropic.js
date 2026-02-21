'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');

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
 * Stream chat from Anthropic Messages API.
 * messages: array already in Anthropic format (no system role items; those go in systemPrompt)
 */
async function streamChat(backend, model, messages, systemPrompt, tools, onChunk, onDone, onError) {
  const { decrypt } = require('../crypto');
  const apiKey = decrypt(backend.api_key_encrypted);
  const baseUrl = backend.base_url.replace(/\/$/, '');

  // Filter out system messages; they go in the top-level "system" field
  const filteredMessages = messages.filter(m => m.role !== 'system');

  const payload = {
    model,
    max_tokens: 4096,
    messages: filteredMessages,
    stream: true,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    ...(tools && tools.length > 0 ? {
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters || { type: 'object', properties: {} },
      })),
    } : {}),
  };

  const body = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'Content-Length': Buffer.byteLength(body),
  };

  let res;
  try {
    res = await makeRequest(`${baseUrl}/v1/messages`, { method: 'POST', headers }, body);
  } catch (err) {
    onError(err);
    return;
  }

  if (res.statusCode !== 200) {
    let errBody = '';
    res.on('data', d => { errBody += d; });
    res.on('end', () => {
      onError(new Error(`Anthropic API error ${res.statusCode}: ${errBody}`));
    });
    return;
  }

  let buffer = '';
  let fullText = '';
  // Track tool use blocks by index
  const toolUseMap = {};
  let stopReason = 'end_turn';

  res.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();

    let eventType = null;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('event:')) {
        eventType = trimmed.slice(6).trim();
        continue;
      }
      if (!trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      try {
        const parsed = JSON.parse(dataStr);

        if (parsed.type === 'message_delta' && parsed.delta && parsed.delta.stop_reason) {
          stopReason = parsed.delta.stop_reason;
        }

        if (parsed.type === 'content_block_start') {
          const idx = parsed.index;
          if (parsed.content_block && parsed.content_block.type === 'tool_use') {
            toolUseMap[idx] = {
              id: parsed.content_block.id,
              name: parsed.content_block.name,
              inputStr: '',
            };
          }
        }

        if (parsed.type === 'content_block_delta') {
          const idx = parsed.index;
          const delta = parsed.delta;
          if (!delta) continue;

          if (delta.type === 'text_delta' && delta.text) {
            fullText += delta.text;
            onChunk(delta.text);
          }

          if (delta.type === 'input_json_delta' && delta.partial_json !== undefined) {
            if (toolUseMap[idx]) {
              toolUseMap[idx].inputStr += delta.partial_json;
            }
          }
        }
      } catch (_) { /* ignore */ }
    }
  });

  res.on('end', () => {
    const toolCalls = Object.values(toolUseMap).filter(t => t.name).map(t => {
      let input = {};
      try { input = JSON.parse(t.inputStr || '{}'); } catch (_) {}
      return { id: t.id, name: t.name, arguments: JSON.stringify(input) };
    });
    onDone(stopReason, toolCalls, fullText);
  });

  res.on('error', onError);
}

module.exports = { streamChat };
