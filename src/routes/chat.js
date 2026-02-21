'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { decrypt } = require('../crypto');
const { getToolDefinitions, executeTool } = require('../tools');
const openai = require('../providers/openai');
const anthropic = require('../providers/anthropic');
const { modelSupportsVision } = require('../fileProcessor');

function sseWrite(res, event) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Build the message array, injecting file content for text files and images.
 */
function buildUserMessage(content, files, model, providerType) {
  if (!files || files.length === 0) {
    return { role: 'user', content };
  }

  const textParts = [];
  const imageParts = [];

  for (const f of files) {
    if (f.type === 'text') {
      textParts.push(`\n\n[File: ${f.filename}]\n${f.content}`);
    } else if (f.type === 'image') {
      imageParts.push(f);
    }
  }

  const fullText = content + textParts.join('');

  if (imageParts.length === 0) {
    return { role: 'user', content: fullText };
  }

  if (!modelSupportsVision(model)) {
    throw new Error(`Model ${model} does not support image inputs. Please use a vision-capable model like gpt-4o or claude-3.`);
  }

  if (providerType === 'anthropic') {
    const parts = [];
    for (const img of imageParts) {
      parts.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
      });
    }
    parts.push({ type: 'text', text: fullText });
    return { role: 'user', content: parts };
  } else {
    // OpenAI format
    const parts = [{ type: 'text', text: fullText }];
    for (const img of imageParts) {
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
      });
    }
    return { role: 'user', content: parts };
  }
}

/**
 * Stream from the provider and return a promise that resolves with { toolCalls, fullText }.
 */
function streamFromProvider(providerType, backend, model, messages, systemPrompt, toolDefs, res) {
  return new Promise((resolve, reject) => {
    const onChunk = (text) => sseWrite(res, { type: 'chunk', content: text });
    const onDone = (finishReason, toolCalls, fullText) => resolve({ toolCalls, fullText, finishReason });
    const onError = (err) => reject(err);

    if (providerType === 'openai') {
      openai.streamChat(backend, model, messages, toolDefs, onChunk, onDone, onError);
    } else if (providerType === 'anthropic') {
      anthropic.streamChat(backend, model, messages, systemPrompt, toolDefs, onChunk, onDone, onError);
    } else {
      reject(new Error(`Unknown provider type: ${providerType}`));
    }
  });
}

// POST /api/chat
router.post('/', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const { conversationId, message, projectId, backendId, model: modelOverride, files } = req.body;

    // Load project
    const project = projectId ? db.getProject(projectId) : db.listProjects()[0];
    if (!project) {
      sseWrite(res, { type: 'error', message: 'Project not found' });
      return res.end();
    }

    let enabledTools = [];
    try { enabledTools = JSON.parse(project.enabled_tools || '[]'); } catch (_) {}

    // Resolve backend
    let backend;
    if (backendId) {
      backend = db.getBackend(backendId);
    } else if (project.default_backend_id) {
      backend = db.getBackend(project.default_backend_id);
    } else {
      backend = db.getDefaultBackend();
    }

    if (!backend) {
      sseWrite(res, { type: 'error', message: 'No backend configured. Please add an AI backend in Settings.' });
      return res.end();
    }

    const providerType = backend.provider_type;
    const model = modelOverride || project.default_model || (providerType === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o');
    const systemPrompt = project.system_prompt || '';

    // Load or create conversation
    let conv;
    if (conversationId) {
      conv = db.getConversation(conversationId);
    }
    if (!conv) {
      conv = db.createConversation({
        project_id: project.id,
        title: (message || '').slice(0, 60) || 'New Conversation',
      });
    }

    let messages = [];
    try { messages = JSON.parse(conv.messages || '[]'); } catch (_) {}

    // Build and add user message
    let userMsg;
    try {
      userMsg = buildUserMessage(message || '', files || [], model, providerType);
    } catch (e) {
      sseWrite(res, { type: 'error', message: e.message });
      return res.end();
    }
    messages.push(userMsg);

    // For OpenAI, prepend system message if not already there
    let messagesForProvider = messages;
    if (providerType === 'openai' && systemPrompt) {
      const hasSystem = messages.some(m => m.role === 'system');
      if (!hasSystem) {
        messagesForProvider = [{ role: 'system', content: systemPrompt }, ...messages];
      }
    }

    const toolDefs = getToolDefinitions(enabledTools);

    // Tool loop
    let loopMessages = [...messagesForProvider];
    let assistantText = '';
    const MAX_TOOL_ITERATIONS = 8;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      let result;
      try {
        result = await streamFromProvider(providerType, backend, model, loopMessages, systemPrompt, toolDefs, res);
      } catch (err) {
        sseWrite(res, { type: 'error', message: err.message });
        return res.end();
      }

      const { toolCalls, fullText, finishReason } = result;
      assistantText += fullText;

      if (!toolCalls || toolCalls.length === 0) {
        // No tool calls - we're done
        break;
      }

      // Add assistant's tool call message to history
      if (providerType === 'openai') {
        loopMessages.push({
          role: 'assistant',
          content: fullText || null,
          tool_calls: toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });
      } else {
        // Anthropic
        const contentBlocks = [];
        if (fullText) contentBlocks.push({ type: 'text', text: fullText });
        for (const tc of toolCalls) {
          let input = {};
          try { input = JSON.parse(tc.arguments || '{}'); } catch (_) {}
          contentBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input });
        }
        loopMessages.push({ role: 'assistant', content: contentBlocks });
      }

      // Execute tools
      const toolResultMessages = [];
      for (const tc of toolCalls) {
        let args = {};
        try { args = JSON.parse(tc.arguments || '{}'); } catch (_) {}

        sseWrite(res, { type: 'tool_start', tool: tc.name, id: tc.id });

        let toolResult;
        try {
          toolResult = await executeTool(tc.name, args);
        } catch (e) {
          toolResult = JSON.stringify({ error: e.message });
        }

        sseWrite(res, { type: 'tool_done', tool: tc.name, result: toolResult, id: tc.id });

        if (providerType === 'openai') {
          toolResultMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: toolResult,
          });
        } else {
          // Anthropic: all tool results go in one user message
          toolResultMessages.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: toolResult,
          });
        }
      }

      if (providerType === 'anthropic') {
        loopMessages.push({ role: 'user', content: toolResultMessages });
      } else {
        loopMessages.push(...toolResultMessages);
      }
    }

    // Build the final messages array to save (without system prefix for OpenAI)
    // We always save the raw user messages (no system) to avoid duplication
    const savedMessages = messages.slice(); // starts with original messages including new user msg

    // Add the assistant's final response
    if (assistantText) {
      // For the stored messages, we collapse the tool loop into just user + assistant messages
      // Re-build from loopMessages, skipping the initial system message if present
      const startIdx = (providerType === 'openai' && systemPrompt) ? 1 : 0;
      const finalMessages = loopMessages.slice(startIdx);
      // Find what was added after the user message
      const originalCount = messages.length; // messages already has the user msg
      const addedMessages = finalMessages.slice(originalCount);
      for (const m of addedMessages) {
        savedMessages.push(m);
      }
      // Add final assistant text if last message isn't already assistant
      const last = savedMessages[savedMessages.length - 1];
      if (!last || last.role !== 'assistant' || (typeof last.content !== 'string' && assistantText)) {
        // Check if the last loopMessage is already an assistant message with text
        if (!addedMessages.some(m => m.role === 'assistant')) {
          savedMessages.push({ role: 'assistant', content: assistantText });
        }
      }
    }

    // Update conversation
    const updatedConv = db.updateConversation(conv.id, {
      messages: savedMessages,
      title: conv.title === 'New Conversation' && message ? message.slice(0, 60) : conv.title,
    });

    sseWrite(res, { type: 'done', conversationId: conv.id });
    res.end();
  } catch (err) {
    try {
      sseWrite(res, { type: 'error', message: err.message });
    } catch (_) {}
    res.end();
  }
});

module.exports = router;
