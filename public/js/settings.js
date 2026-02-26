/**
 * Backend settings modal
 */
(function (global) {
  'use strict';

  async function loadBackends() {
    const res = await fetch('/api/backends');
    return res.json();
  }

  async function saveBackend(data, id) {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/backends/${id}` : '/api/backends';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  }

  async function deleteBackend(id) {
    await fetch(`/api/backends/${id}`, { method: 'DELETE' });
  }

  async function testBackend(id) {
    const res = await fetch(`/api/backends/${id}/test`, { method: 'POST' });
    return res.json();
  }

  async function fetchModels(id) {
    const res = await fetch(`/api/backends/${id}/models`);
    return res.json();
  }

  function renderSettingsModal(backends, onSaved, onDeleted) {
    const body = document.getElementById('settings-body');
    body.innerHTML = '';

    // Add backend form
    const addSection = document.createElement('div');
    addSection.innerHTML = `
      <h3 style="font-size:14px;margin-bottom:10px;color:var(--text-muted)">Add New Backend</h3>
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="be-name" placeholder="My OpenAI" />
      </div>
      <div class="form-group">
        <label>Provider Type</label>
        <select id="be-type">
          <option value="openai">OpenAI-compatible</option>
          <option value="anthropic">Anthropic</option>
        </select>
      </div>
      <div class="form-group">
        <label>Base URL</label>
        <input type="text" id="be-url" placeholder="https://api.openai.com" />
      </div>
      <div class="form-group">
        <label>API Key</label>
        <input type="password" id="be-key" placeholder="sk-..." autocomplete="new-password" />
      </div>
      <div class="form-group">
        <label>Default?</label>
        <select id="be-default">
          <option value="">No</option>
          <option value="1">Yes</option>
        </select>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-primary" id="btn-add-backend">Add Backend</button>
      </div>
      <hr class="divider" />
    `;
    body.appendChild(addSection);

    document.getElementById('btn-add-backend').addEventListener('click', async () => {
      const data = {
        name: document.getElementById('be-name').value.trim(),
        provider_type: document.getElementById('be-type').value,
        base_url: document.getElementById('be-url').value.trim().replace(/\/$/, ''),
        api_key: document.getElementById('be-key').value,
        is_default: !!document.getElementById('be-default').value,
        models: [],
      };
      if (!data.name || !data.base_url) return alert('Name and Base URL are required');
      const result = await saveBackend(data, null);
      if (result.error) return alert(result.error);
      onSaved(result);
      renderSettingsModal(await loadBackends(), onSaved, onDeleted);
    });

    // List backends
    const listSection = document.createElement('div');
    listSection.innerHTML = '<h3 style="font-size:14px;margin-bottom:10px;color:var(--text-muted)">Configured Backends</h3>';
    body.appendChild(listSection);

    if (!backends.length) {
      listSection.innerHTML += '<p style="font-size:13px;color:var(--text-dim);margin-bottom:12px">No backends configured yet. Add one above to get started.</p>';
    }

    backends.forEach(b => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-title">
          ${escapeHtml(b.name)}
          ${b.is_default ? '<span class="badge green">Default</span>' : ''}
          <span class="badge">${b.provider_type}</span>
        </div>
        <div class="card-meta">${escapeHtml(b.base_url)}</div>
        <div class="card-meta">API Key: ${b.api_key_masked || '(none)'}</div>
        <div class="card-meta" id="models-list-${b.id}">
          Models: ${(b.models || []).length > 0 ? b.models.slice(0,3).join(', ') + (b.models.length > 3 ? ` +${b.models.length-3} more` : '') : 'none stored'}
        </div>
        <div class="card-actions">
          <button class="btn-secondary btn-edit-be" data-id="${b.id}">Edit</button>
          <button class="btn-secondary btn-test-be" data-id="${b.id}">Test</button>
          <button class="btn-secondary btn-fetch-models" data-id="${b.id}">Fetch Models</button>
          <button class="btn-danger btn-del-be" data-id="${b.id}">Delete</button>
        </div>
        <div class="edit-form" id="edit-form-${b.id}" style="display:none;margin-top:12px">
          <div class="form-group"><label>Name</label><input type="text" class="edit-be-name" value="${escapeHtml(b.name)}" /></div>
          <div class="form-group"><label>Provider Type</label><select class="edit-be-type"><option value="openai" ${b.provider_type==='openai'?'selected':''}>OpenAI-compatible</option><option value="anthropic" ${b.provider_type==='anthropic'?'selected':''}>Anthropic</option></select></div>
          <div class="form-group"><label>Base URL</label><input type="text" class="edit-be-url" value="${escapeHtml(b.base_url)}" /></div>
          <div class="form-group"><label>API Key (leave blank to keep current)</label><input type="password" class="edit-be-key" placeholder="sk-..." /></div>
          <div class="form-group"><label>Default?</label><select class="edit-be-default"><option value="">No</option><option value="1" ${b.is_default?'selected':''}>Yes</option></select></div>
          <button class="btn-primary btn-save-edit" data-id="${b.id}">Save Changes</button>
        </div>
      `;

      card.querySelector('.btn-edit-be').addEventListener('click', () => {
        const form = card.querySelector(`#edit-form-${b.id}`);
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
      });

      card.querySelector('.btn-save-edit').addEventListener('click', async () => {
        const keyVal = card.querySelector('.edit-be-key').value;
        const data = {
          name: card.querySelector('.edit-be-name').value.trim(),
          provider_type: card.querySelector('.edit-be-type').value,
          base_url: card.querySelector('.edit-be-url').value.trim().replace(/\/$/, ''),
          is_default: !!card.querySelector('.edit-be-default').value,
        };
        if (keyVal) data.api_key = keyVal;
        const result = await saveBackend(data, b.id);
        if (result.error) return alert(result.error);
        onSaved(result);
        renderSettingsModal(await loadBackends(), onSaved, onDeleted);
      });

      card.querySelector('.btn-test-be').addEventListener('click', async () => {
        const btn = card.querySelector('.btn-test-be');
        btn.textContent = 'Testing...';
        btn.disabled = true;
        const result = await testBackend(b.id);
        btn.textContent = result.success ? '✓ Success' : '✗ Failed';
        btn.style.color = result.success ? 'var(--accent)' : 'var(--danger)';
        setTimeout(() => { btn.textContent = 'Test'; btn.disabled = false; btn.style.color = ''; }, 3000);
      });

      card.querySelector('.btn-fetch-models').addEventListener('click', async () => {
        const btn = card.querySelector('.btn-fetch-models');
        btn.textContent = 'Fetching...';
        btn.disabled = true;
        const result = await fetchModels(b.id);
        btn.textContent = 'Fetch Models';
        btn.disabled = false;
        if (result.models) {
          const modelsEl = card.querySelector(`#models-list-${b.id}`);
          const m = result.models;
          modelsEl.textContent = `Models: ${m.slice(0,3).join(', ')}${m.length > 3 ? ` +${m.length-3} more` : ''}`;
          onSaved({ ...b, models: m });
        }
      });

      card.querySelector('.btn-del-be').addEventListener('click', async () => {
        if (!confirm(`Delete backend "${b.name}"?`)) return;
        await deleteBackend(b.id);
        onDeleted(b.id);
        renderSettingsModal(await loadBackends(), onSaved, onDeleted);
      });

      body.appendChild(card);
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  global.SettingsUI = {
    loadBackends,
    saveBackend,
    deleteBackend,
    testBackend,
    fetchModels,
    renderSettingsModal,
  };
})(window);
