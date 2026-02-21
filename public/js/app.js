/**
 * Main application entry point
 */
(function (global) {
  'use strict';

  const state = {
    currentConversationId: null,
    currentProjectId: null,
    selectedBackendId: null,
    selectedModel: null,
    backends: [],
    projects: [],
    conversations: [],
  };

  global.AppState = state;

  async function init() {
    // Load initial data
    await Promise.all([
      loadBackends(),
      loadProjects(),
    ]);

    // Select default project
    if (state.projects.length) {
      const stored = localStorage.getItem('currentProjectId');
      const found = stored ? state.projects.find(p => p.id === stored) : null;
      state.currentProjectId = (found || state.projects[0]).id;
    }

    renderProjectSelector();
    await loadConversations();
    renderBackendSelector();
    renderModelSelector();

    // Show empty state
    ChatUI.showEmptyState();

    // Wire up UI events
    document.getElementById('btn-new-chat').addEventListener('click', handleNewChat);

    document.getElementById('project-select').addEventListener('change', async (e) => {
      state.currentProjectId = e.target.value;
      localStorage.setItem('currentProjectId', state.currentProjectId);
      state.currentConversationId = null;
      await loadConversations();
      updateProjectLabel();
      ChatUI.showEmptyState();
    });

    document.getElementById('backend-select').addEventListener('change', (e) => {
      const val = e.target.value;
      if (val) {
        state.selectedBackendId = val;
        localStorage.setItem('selectedBackendId', val);
        populateModels();
      }
    });

    document.getElementById('model-select').addEventListener('change', (e) => {
      state.selectedModel = e.target.value;
      localStorage.setItem('selectedModel', e.target.value);
    });

    // Settings modal
    document.getElementById('btn-settings').addEventListener('click', async () => {
      await loadBackends();
      SettingsUI.renderSettingsModal(
        state.backends,
        (saved) => {
          loadBackends().then(renderBackendSelector);
        },
        (deletedId) => {
          loadBackends().then(renderBackendSelector);
        }
      );
      openModal('settings-modal');
    });

    // Projects modal
    document.getElementById('btn-manage-projects').addEventListener('click', async () => {
      await Promise.all([loadBackends(), loadProjects()]);
      ProjectsUI.renderProjectsModal(
        state.projects,
        state.backends,
        async (saved) => {
          await loadProjects();
          renderProjectSelector();
        },
        async (deletedId) => {
          await loadProjects();
          if (state.currentProjectId === deletedId) {
            state.currentProjectId = state.projects[0]?.id || null;
          }
          renderProjectSelector();
          await loadConversations();
        }
      );
      openModal('projects-modal');
    });

    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        closeModal(btn.dataset.modal);
      });
    });

    // Close modal on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal.id);
      });
    });

    // Init chat UI
    ChatUI.init();
    updateProjectLabel();
  }

  async function loadBackends() {
    try {
      const data = await SettingsUI.loadBackends();
      state.backends = Array.isArray(data) ? data : [];
    } catch (e) {
      state.backends = [];
    }
    return state.backends;
  }

  async function loadProjects() {
    try {
      const data = await ProjectsUI.loadProjects();
      state.projects = Array.isArray(data) ? data : [];
    } catch (e) {
      state.projects = [];
    }
    return state.projects;
  }

  async function loadConversations() {
    try {
      const data = await ConversationsUI.loadConversations(state.currentProjectId);
      state.conversations = Array.isArray(data) ? data : [];
    } catch (e) {
      state.conversations = [];
    }
    renderConversationList();
    return state.conversations;
  }

  function renderProjectSelector() {
    const sel = document.getElementById('project-select');
    sel.innerHTML = '';
    state.projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === state.currentProjectId) opt.selected = true;
      sel.appendChild(opt);
    });
    if (!state.currentProjectId && state.projects.length) {
      state.currentProjectId = state.projects[0].id;
    }
    updateProjectLabel();
  }

  function updateProjectLabel() {
    const project = state.projects.find(p => p.id === state.currentProjectId);
    document.getElementById('current-project-label').textContent = project ? project.name : '';
  }

  function renderBackendSelector() {
    const sel = document.getElementById('backend-select');
    const current = sel.value || state.selectedBackendId || localStorage.getItem('selectedBackendId');
    sel.innerHTML = '<option value="">— Select Backend —</option>';
    state.backends.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.name + (b.is_default ? ' ★' : '');
      sel.appendChild(opt);
    });

    // Auto-select
    if (current && state.backends.find(b => b.id === current)) {
      sel.value = current;
      state.selectedBackendId = current;
    } else {
      const def = state.backends.find(b => b.is_default) || state.backends[0];
      if (def) {
        sel.value = def.id;
        state.selectedBackendId = def.id;
      }
    }

    populateModels();
  }

  function populateModels() {
    const sel = document.getElementById('model-select');
    const backend = state.backends.find(b => b.id === state.selectedBackendId);
    const storedModel = localStorage.getItem('selectedModel');
    sel.innerHTML = '';

    if (!backend) {
      sel.innerHTML = '<option value="">— No backend —</option>';
      return;
    }

    const models = backend.models || [];
    const defaults = backend.provider_type === 'anthropic'
      ? ['claude-opus-4-5', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229']
      : ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];

    const combined = [...new Set([...models, ...defaults])];
    combined.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      sel.appendChild(opt);
    });

    // Restore selection
    if (storedModel && combined.includes(storedModel)) {
      sel.value = storedModel;
      state.selectedModel = storedModel;
    } else if (combined.length) {
      sel.value = combined[0];
      state.selectedModel = combined[0];
    }
  }

  function renderConversationList() {
    ConversationsUI.renderConversationList(
      state.conversations,
      state.currentConversationId,
      handleSelectConversation,
      handleDeleteConversation,
      handleRenameConversation
    );
  }

  async function handleNewChat() {
    state.currentConversationId = null;
    ChatUI.showEmptyState();
    renderConversationList();
  }

  async function handleSelectConversation(id) {
    state.currentConversationId = id;
    renderConversationList();

    // Load messages
    try {
      const res = await fetch(`/api/conversations/${id}/messages`);
      const data = await res.json();
      if (data.messages) {
        ChatUI.renderMessages(data.messages);
      }
    } catch (e) {
      ChatUI.showEmptyState();
    }
  }

  async function handleDeleteConversation(id) {
    await ConversationsUI.deleteConversation(id);
    if (state.currentConversationId === id) {
      state.currentConversationId = null;
      ChatUI.showEmptyState();
    }
    await loadConversations();
  }

  async function handleRenameConversation(id, title) {
    await ConversationsUI.renameConversation(id, title);
    await loadConversations();
  }

  function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
  }

  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  }

  // Expose for ChatUI to call after a new message is sent
  global.App = {
    refreshConversations: async (conversationId) => {
      if (conversationId && conversationId !== state.currentConversationId) {
        state.currentConversationId = conversationId;
      }
      await loadConversations();
    },
  };

  // Start
  document.addEventListener('DOMContentLoaded', init);
})(window);
