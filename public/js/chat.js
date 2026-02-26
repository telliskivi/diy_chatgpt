/**
 * Chat UI logic - sending messages, SSE streaming, rendering
 */
(function (global) {
  'use strict';

  let pendingFiles = []; // Array of { type, content|base64, mimeType, filename, size }
  let isStreaming = false;
  let currentAssistantBubble = null;
  let currentAssistantText = '';
  let toolIndicators = {}; // id -> DOM element

  function init() {
    const sendBtn = document.getElementById('btn-send');
    const input = document.getElementById('message-input');
    const fileInput = document.getElementById('file-input');

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 200) + 'px';
    });

    fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        await uploadFile(file);
      }
      fileInput.value = '';
    });
  }

  async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) {
        showNotification('Upload error: ' + data.error, 'error');
        return;
      }
      pendingFiles.push(data);
      renderFilePreviews();
    } catch (e) {
      showNotification('Upload failed: ' + e.message, 'error');
    }
  }

  function renderFilePreviews() {
    const container = document.getElementById('file-previews');
    container.innerHTML = '';
    pendingFiles.forEach((f, i) => {
      const div = document.createElement('div');
      div.className = 'file-preview';
      if (f.type === 'image') {
        const img = document.createElement('img');
        img.className = 'thumb';
        img.src = `data:${f.mimeType};base64,${f.base64}`;
        div.appendChild(img);
      } else {
        div.appendChild(document.createTextNode('📄 '));
      }
      div.appendChild(document.createTextNode(f.filename));
      const rm = document.createElement('button');
      rm.className = 'remove-file';
      rm.textContent = '✕';
      rm.addEventListener('click', () => {
        pendingFiles.splice(i, 1);
        renderFilePreviews();
      });
      div.appendChild(rm);
      container.appendChild(div);
    });
  }

  async function handleSend() {
    if (isStreaming) return;
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    if (!message && pendingFiles.length === 0) return;

    const state = global.AppState;
    input.value = '';
    input.style.height = 'auto';

    // Render user message
    addUserMessage(message, pendingFiles);

    const files = [...pendingFiles];
    pendingFiles = [];
    renderFilePreviews();

    await sendMessage(message, files, state);
  }

  async function sendMessage(message, files, state) {
    isStreaming = true;
    setInputDisabled(true);

    // Create assistant placeholder
    currentAssistantText = '';
    currentAssistantBubble = addAssistantMessage('');
    toolIndicators = {};

    const body = {
      message,
      conversationId: state.currentConversationId,
      projectId: state.currentProjectId,
      backendId: state.selectedBackendId || undefined,
      model: state.selectedModel || undefined,
      files: files || [],
    };

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      await readSSEStream(response.body, state);
    } catch (err) {
      updateAssistantBubble(`⚠ Error: ${err.message}`, true);
    } finally {
      isStreaming = false;
      setInputDisabled(false);
      document.getElementById('message-input').focus();
    }
  }

  async function readSSEStream(body, state) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop(); // keep incomplete chunk

      for (const part of parts) {
        const lines = part.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;
          try {
            const event = JSON.parse(jsonStr);
            handleSSEEvent(event, state);
          } catch (_) {}
        }
      }
    }
  }

  function handleSSEEvent(event, state) {
    switch (event.type) {
      case 'chunk':
        currentAssistantText += event.content;
        updateAssistantBubble(currentAssistantText, false);
        break;

      case 'tool_start': {
        const ind = createToolIndicator(event.tool, event.id, 'running');
        const wrapper = currentAssistantBubble.closest('.msg-wrapper');
        wrapper.parentNode.insertBefore(ind, wrapper.nextSibling);
        toolIndicators[event.id] = ind;
        break;
      }

      case 'tool_done': {
        const ind = toolIndicators[event.id];
        if (ind) {
          updateToolIndicator(ind, event.tool, event.result, 'done');
        }
        break;
      }

      case 'done':
        if (event.conversationId) {
          state.currentConversationId = event.conversationId;
          // Refresh conversation list
          if (global.App && global.App.refreshConversations) {
            global.App.refreshConversations(event.conversationId);
          }
        }
        break;

      case 'error':
        updateAssistantBubble(currentAssistantText || `⚠ ${event.message}`, false);
        if (!currentAssistantText) {
          currentAssistantBubble.classList.add('error');
          currentAssistantBubble.textContent = `⚠ ${event.message}`;
        }
        break;
    }
  }

  function addUserMessage(content, files) {
    const list = document.getElementById('messages-list');
    const emptyState = document.getElementById('empty-state');
    if (emptyState) emptyState.remove();

    const wrapper = document.createElement('div');
    wrapper.className = 'msg-wrapper user';

    const label = document.createElement('div');
    label.className = 'msg-role-label';
    label.textContent = 'You';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble user';

    if (files && files.length > 0) {
      const fileInfo = files.map(f => f.type === 'image'
        ? `<div style="margin-bottom:6px"><img src="data:${f.mimeType};base64,${f.base64}" style="max-width:200px;max-height:150px;border-radius:8px;display:block" /></div>`
        : `<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">📄 ${escapeHtml(f.filename)}</div>`
      ).join('');
      bubble.innerHTML = fileInfo + (content ? `<div>${renderMarkdown(content)}</div>` : '');
    } else {
      bubble.innerHTML = renderMarkdown(content) || '&nbsp;';
    }

    wrapper.appendChild(label);
    wrapper.appendChild(bubble);
    list.appendChild(wrapper);
    scrollToBottom();
    return bubble;
  }

  function addAssistantMessage(content) {
    const list = document.getElementById('messages-list');

    const wrapper = document.createElement('div');
    wrapper.className = 'msg-wrapper assistant';

    const label = document.createElement('div');
    label.className = 'msg-role-label';
    label.textContent = 'Assistant';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble assistant';
    bubble.innerHTML = content
      ? renderMarkdown(content)
      : '<div class="thinking-dots"><span></span><span></span><span></span></div>';

    wrapper.appendChild(label);
    wrapper.appendChild(bubble);
    list.appendChild(wrapper);
    scrollToBottom();
    return bubble;
  }

  function updateAssistantBubble(text, isError) {
    if (!currentAssistantBubble) return;
    if (isError) {
      currentAssistantBubble.classList.add('error');
      currentAssistantBubble.textContent = text;
    } else {
      currentAssistantBubble.innerHTML = text
        ? renderMarkdown(text)
        : '<div class="thinking-dots"><span></span><span></span><span></span></div>';
    }
    scrollToBottom();
  }

  function createToolIndicator(toolName, id, status) {
    const el = document.createElement('div');
    el.className = `tool-indicator ${status === 'done' ? 'done' : ''}`;
    el.dataset.toolId = id;
    const spinner = status !== 'done' ? '<div class="spinner"></div>' : '✓';
    el.innerHTML = `${spinner} <span>Running tool: <strong>${escapeHtml(toolName)}</strong></span>`;
    return el;
  }

  function updateToolIndicator(el, toolName, result, status) {
    el.className = `tool-indicator ${status}`;
    let resultPreview = '';
    try {
      const parsed = JSON.parse(result);
      resultPreview = JSON.stringify(parsed).slice(0, 80);
    } catch (_) {
      resultPreview = String(result || '').slice(0, 80);
    }
    el.innerHTML = `✓ <span>Tool <strong>${escapeHtml(toolName)}</strong>: ${escapeHtml(resultPreview)}${result && result.length > 80 ? '...' : ''}</span>`;
  }

  function renderMessages(messages) {
    const list = document.getElementById('messages-list');
    list.innerHTML = '';

    const displayable = messages.filter(m =>
      (m.role === 'user' || m.role === 'assistant') &&
      (typeof m.content === 'string' || Array.isArray(m.content))
    );

    if (!displayable.length) {
      showEmptyState();
      return;
    }

    displayable.forEach(m => {
      const wrapper = document.createElement('div');
      wrapper.className = `msg-wrapper ${m.role}`;

      const label = document.createElement('div');
      label.className = 'msg-role-label';
      label.textContent = m.role === 'user' ? 'You' : 'Assistant';

      const bubble = document.createElement('div');
      bubble.className = `msg-bubble ${m.role}`;

      if (Array.isArray(m.content)) {
        let html = '';
        m.content.forEach(part => {
          if (part.type === 'text') html += renderMarkdown(part.text || '');
          else if (part.type === 'image_url') {
            html += `<img src="${part.image_url.url}" style="max-width:300px;border-radius:8px;display:block;margin:4px 0" />`;
          } else if (part.type === 'image' && part.source) {
            html += `<img src="data:${part.source.media_type};base64,${part.source.data}" style="max-width:300px;border-radius:8px;display:block;margin:4px 0" />`;
          }
        });
        bubble.innerHTML = html;
      } else {
        bubble.innerHTML = renderMarkdown(m.content || '');
      }

      wrapper.appendChild(label);
      wrapper.appendChild(bubble);
      list.appendChild(wrapper);
    });

    scrollToBottom();
  }

  function showEmptyState() {
    const list = document.getElementById('messages-list');
    list.innerHTML = `
      <div id="empty-state">
        <h2>DIY ChatGPT</h2>
        <p>Start a conversation by typing a message below.</p>
      </div>
    `;
  }

  function scrollToBottom() {
    const container = document.getElementById('messages-container');
    container.scrollTop = container.scrollHeight;
  }

  function setInputDisabled(disabled) {
    document.getElementById('message-input').disabled = disabled;
    document.getElementById('btn-send').disabled = disabled;
  }

  function showNotification(msg, type) {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;top:16px;right:16px;background:${type === 'error' ? '#e74c3c' : '#10a37f'};color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;z-index:9999;`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  global.ChatUI = {
    init,
    sendMessage,
    renderMessages,
    showEmptyState,
    showNotification,
    addUserMessage,
    addAssistantMessage,
  };
})(window);
