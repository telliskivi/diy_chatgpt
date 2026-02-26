/**
 * Conversation list management
 */
(function (global) {
  'use strict';

  async function loadConversations(projectId) {
    const url = projectId ? `/api/conversations?projectId=${projectId}` : '/api/conversations';
    const res = await fetch(url);
    return res.json();
  }

  async function createConversation(projectId) {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, title: 'New Conversation' }),
    });
    return res.json();
  }

  async function deleteConversation(id) {
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
  }

  async function renameConversation(id, title) {
    const res = await fetch(`/api/conversations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    return res.json();
  }

  function renderConversationList(conversations, currentId, onSelect, onDelete, onRename) {
    const list = document.getElementById('conversation-list');
    list.innerHTML = '';

    if (!conversations.length) {
      list.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--text-dim);text-align:center;">No conversations yet</div>';
      return;
    }

    conversations.forEach(conv => {
      const item = document.createElement('div');
      item.className = 'conv-item' + (conv.id === currentId ? ' active' : '');
      item.dataset.id = conv.id;

      const titleSpan = document.createElement('span');
      titleSpan.className = 'conv-title';
      titleSpan.textContent = conv.title || 'Untitled';
      titleSpan.title = conv.title || 'Untitled';

      // Double-click to rename
      titleSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const input = document.createElement('input');
        input.value = conv.title || '';
        input.addEventListener('blur', async () => {
          const newTitle = input.value.trim() || conv.title;
          await onRename(conv.id, newTitle);
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') input.blur();
          if (e.key === 'Escape') { input.value = conv.title; input.blur(); }
        });
        titleSpan.textContent = '';
        titleSpan.appendChild(input);
        input.focus();
        input.select();
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'conv-delete';
      deleteBtn.textContent = '🗑';
      deleteBtn.title = 'Delete';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete this conversation?')) {
          onDelete(conv.id);
        }
      });

      item.appendChild(titleSpan);
      item.appendChild(deleteBtn);

      item.addEventListener('click', () => onSelect(conv.id));

      list.appendChild(item);
    });
  }

  global.ConversationsUI = {
    loadConversations,
    createConversation,
    deleteConversation,
    renameConversation,
    renderConversationList,
  };
})(window);
