/**
 * Project management UI
 */
(function (global) {
  'use strict';

  const ALL_TOOL_NAMES = [
    'get_datetime', 'web_search', 'web_fetch',
    'todo_list', 'todo_create', 'todo_update', 'todo_delete',
    'calendar_list', 'calendar_create', 'calendar_update', 'calendar_delete',
  ];

  async function loadProjects() {
    const res = await fetch('/api/projects');
    return res.json();
  }

  async function createProject(data) {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  }

  async function updateProject(id, data) {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  }

  async function deleteProject(id) {
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
  }

  function renderProjectsModal(projects, backends, onSaved, onDeleted) {
    const body = document.getElementById('projects-body');
    body.innerHTML = '';

    // Add project form
    const addSection = document.createElement('div');
    addSection.innerHTML = `
      <h3 style="font-size:14px;margin-bottom:10px;color:var(--text-muted)">Add New Project</h3>
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="proj-name" placeholder="My Project" />
      </div>
      <div class="form-group">
        <label>System Prompt</label>
        <textarea id="proj-prompt" placeholder="You are a helpful assistant..."></textarea>
      </div>
      <button class="btn-primary" id="btn-add-project">Create Project</button>
      <hr class="divider" />
    `;
    body.appendChild(addSection);

    document.getElementById('btn-add-project').addEventListener('click', async () => {
      const name = document.getElementById('proj-name').value.trim();
      if (!name) return alert('Project name is required');
      const proj = await createProject({
        name,
        system_prompt: document.getElementById('proj-prompt').value,
        enabled_tools: [...ALL_TOOL_NAMES],
      });
      if (proj.error) return alert(proj.error);
      onSaved(proj);
      renderProjectsModal(await loadProjects(), backends, onSaved, onDeleted);
    });

    // List existing projects
    const listSection = document.createElement('div');
    listSection.innerHTML = '<h3 style="font-size:14px;margin-bottom:10px;color:var(--text-muted)">Existing Projects</h3>';
    body.appendChild(listSection);

    projects.forEach(p => {
      const card = document.createElement('div');
      card.className = 'card';

      let enabledTools = p.enabled_tools || [];
      let editingTools = [...enabledTools];

      card.innerHTML = `
        <div class="card-title">${escapeHtml(p.name)} ${p.name === 'Default' ? '<span class="badge green">Default</span>' : ''}</div>
        <div class="form-group" style="margin-top:10px">
          <label>System Prompt</label>
          <textarea class="proj-edit-prompt" style="min-height:60px">${escapeHtml(p.system_prompt || '')}</textarea>
        </div>
        <div class="form-group">
          <label>Default Backend</label>
          <select class="proj-backend-sel">
            <option value="">— Use conversation setting —</option>
            ${backends.map(b => `<option value="${b.id}" ${p.default_backend_id === b.id ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Default Model</label>
          <input class="proj-model-inp" type="text" value="${escapeHtml(p.default_model || '')}" placeholder="e.g. gpt-4o" />
        </div>
        <div class="form-group">
          <label>Enabled Tools</label>
          <div class="tools-grid proj-tools-grid">
            ${ALL_TOOL_NAMES.map(t => `
              <button class="tool-toggle ${enabledTools.includes(t) ? 'active' : ''}" data-tool="${t}">${t.replace(/_/g, ' ')}</button>
            `).join('')}
          </div>
        </div>
        <div class="card-actions">
          <button class="btn-primary proj-save-btn">Save</button>
          ${p.name !== 'Default' ? '<button class="btn-danger proj-del-btn">Delete</button>' : ''}
        </div>
      `;

      // Tool toggles
      card.querySelectorAll('.tool-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          btn.classList.toggle('active');
          const tool = btn.dataset.tool;
          if (btn.classList.contains('active')) {
            if (!editingTools.includes(tool)) editingTools.push(tool);
          } else {
            editingTools = editingTools.filter(t => t !== tool);
          }
        });
      });

      card.querySelector('.proj-save-btn').addEventListener('click', async () => {
        const updated = await updateProject(p.id, {
          system_prompt: card.querySelector('.proj-edit-prompt').value,
          default_backend_id: card.querySelector('.proj-backend-sel').value || null,
          default_model: card.querySelector('.proj-model-inp').value || null,
          enabled_tools: editingTools,
        });
        if (updated.error) return alert(updated.error);
        onSaved(updated);
      });

      const delBtn = card.querySelector('.proj-del-btn');
      if (delBtn) {
        delBtn.addEventListener('click', async () => {
          if (!confirm(`Delete project "${p.name}"?`)) return;
          await deleteProject(p.id);
          onDeleted(p.id);
          renderProjectsModal(await loadProjects(), backends, onSaved, onDeleted);
        });
      }

      body.appendChild(card);
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  global.ProjectsUI = {
    loadProjects,
    createProject,
    updateProject,
    deleteProject,
    renderProjectsModal,
    ALL_TOOL_NAMES,
  };
})(window);
