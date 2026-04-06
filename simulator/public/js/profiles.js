/**
 * Profile management view.
 */
import { profiles, simulations } from './api.js';

const FORM_FIELDS = [
  { key: 'name', label: 'Profile Name', type: 'text', required: true },
  { key: 'durationDays', label: 'Duration (days)', type: 'number', default: 30, configField: true },
  { key: 'runsPerDay', label: 'Runs Per Day', type: 'number', default: 2, configField: true },
  { key: 'speedReviewAccuracy', label: 'Speed Review Accuracy', type: 'range', min: 0, max: 1, step: 0.05, default: 0.7, configField: true },
  { key: 'wordDiscoveryAccuracy', label: 'Word Discovery Accuracy', type: 'range', min: 0, max: 1, step: 0.05, default: 0.9, configField: true },
  { key: 'combatSkill', label: 'Combat Skill', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5, configField: true },
  { key: 'dailyPlayMinutes', label: 'Daily Play Minutes', type: 'number', default: 60, configField: true },
  { key: 'aiDialogueMode', label: 'AI Dialogue Mode', type: 'select', options: ['skip', 'cached', 'real'], default: 'skip', configField: true },
];

function getStatusClass(status) {
  if (!status) return '';
  return `status-${status}`;
}

function renderProfileCard(profile, onAction) {
  const sim = profile.latestSimulation;
  const config = profile.config || {};
  const duration = config.durationDays || 30;

  const card = document.createElement('div');
  card.className = 'profile-card';

  let progressHtml = '';
  let statusHtml = '';
  if (sim) {
    const progress = sim.current_day ? Math.min((sim.current_day / duration) * 100, 100) : 0;
    progressHtml = `
      <div class="progress-bar"><div class="fill" style="width: ${progress}%"></div></div>
      <span style="font-size: 10px; color: var(--text-dim)">Day ${sim.current_day || 0} / ${duration}</span>
    `;
    statusHtml = `<span class="status-badge ${getStatusClass(sim.status)}">${sim.status || 'unknown'}</span>`;
  }

  card.innerHTML = `
    <h3>${esc(profile.name)} ${statusHtml}</h3>
    <div class="meta">
      <span>${config.runsPerDay || 2} runs/day</span>
      <span>${Math.round((config.speedReviewAccuracy || 0.7) * 100)}% acc</span>
      <span>${duration}d</span>
      <span>combat: ${Math.round((config.combatSkill || 0.5) * 100)}%</span>
    </div>
    ${progressHtml}
    <div class="actions">
      ${sim && sim.status === 'running' ?
        `<button class="btn btn-sm" data-action="pause">Pause</button>` :
      sim && sim.status === 'paused' ?
        `<button class="btn btn-sm" data-action="resume">Resume</button>
         <button class="btn btn-sm btn-primary" data-action="run">New Run</button>` :
        `<button class="btn btn-sm btn-primary" data-action="run">Run</button>`
      }
      ${sim ? `<button class="btn btn-sm" data-action="view">View</button>` : ''}
      <button class="btn btn-sm" data-action="edit">Edit</button>
      <button class="btn btn-sm btn-danger" data-action="delete">Del</button>
    </div>
  `;

  card.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    onAction(btn.dataset.action, profile, sim);
  });

  return card;
}

function buildFormHtml(data = {}) {
  let html = '';
  for (const field of FORM_FIELDS) {
    const value = field.configField ? (data.config?.[field.key] ?? field.default) : (data[field.key] ?? field.default ?? '');

    if (field.type === 'range') {
      html += `
        <div class="form-group">
          <label class="range-label">
            <span>${field.label}</span>
            <span class="range-value" id="rv-${field.key}">${value}</span>
          </label>
          <input type="range" name="${field.key}" min="${field.min}" max="${field.max}" step="${field.step}" value="${value}"
            oninput="document.getElementById('rv-${field.key}').textContent = this.value">
        </div>`;
    } else if (field.type === 'select') {
      const opts = field.options.map(o =>
        `<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`
      ).join('');
      html += `
        <div class="form-group">
          <label>${field.label}</label>
          <select name="${field.key}">${opts}</select>
        </div>`;
    } else {
      html += `
        <div class="form-group">
          <label>${field.label}</label>
          <input type="${field.type}" name="${field.key}" value="${esc(String(value))}" ${field.required ? 'required' : ''}>
        </div>`;
    }
  }
  return html;
}

function readForm(form) {
  const name = form.querySelector('[name="name"]').value.trim();
  const config = {};
  for (const field of FORM_FIELDS) {
    if (!field.configField) continue;
    const el = form.querySelector(`[name="${field.key}"]`);
    if (!el) continue;
    if (field.type === 'number') {
      config[field.key] = Number(el.value);
    } else if (field.type === 'range') {
      config[field.key] = parseFloat(el.value);
    } else {
      config[field.key] = el.value;
    }
  }
  return { name, config };
}

function showModal(title, bodyHtml, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>${title}</h2>
      <form>${bodyHtml}
        <div class="modal-actions">
          <button type="button" class="btn" data-dismiss>Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-dismiss]')) {
      overlay.remove();
    }
  });

  overlay.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const { name, config } = readForm(form);
    if (!name) return;

    const saveBtn = form.querySelector('[type="submit"]');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      await onSave(name, config);
      overlay.remove();
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      alert(err.message);
    }
  });

  document.body.appendChild(overlay);
  overlay.querySelector('input, select')?.focus();
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export async function renderProfiles(appEl) {
  appEl.innerHTML = '<div class="empty-state">Loading profiles...</div>';

  let profileList;
  try {
    profileList = await profiles.list();
  } catch (err) {
    appEl.innerHTML = `<div class="empty-state">Error loading profiles: ${esc(err.message)}</div>`;
    return;
  }

  const container = document.createElement('div');

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `
    <h2>Learner Profiles</h2>
    <button class="btn btn-primary" id="btn-create">+ New Profile</button>
  `;
  container.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'profile-grid';

  if (profileList.length === 0) {
    grid.innerHTML = '<div class="empty-state">No profiles yet. Create one to get started.</div>';
  }

  for (const profile of profileList) {
    grid.appendChild(renderProfileCard(profile, handleAction));
  }

  container.appendChild(grid);
  appEl.innerHTML = '';
  appEl.appendChild(container);

  document.getElementById('btn-create').addEventListener('click', () => {
    showModal('Create Profile', buildFormHtml(), async (name, config) => {
      await profiles.create(name, config);
      renderProfiles(appEl);
    });
  });

  async function handleAction(action, profile, sim) {
    try {
      switch (action) {
        case 'run': {
          await simulations.start(profile.id);
          renderProfiles(appEl);
          break;
        }
        case 'pause': {
          if (sim) await simulations.pause(sim.id);
          renderProfiles(appEl);
          break;
        }
        case 'resume': {
          if (sim) await simulations.resume(sim.id);
          renderProfiles(appEl);
          break;
        }
        case 'view': {
          if (sim) window.navigate(`#results/${sim.id}`);
          break;
        }
        case 'edit': {
          showModal('Edit Profile', buildFormHtml(profile), async (name, config) => {
            await profiles.update(profile.id, name, config);
            renderProfiles(appEl);
          });
          break;
        }
        case 'delete': {
          if (confirm(`Delete profile "${profile.name}"? This will delete all simulations.`)) {
            await profiles.delete(profile.id);
            renderProfiles(appEl);
          }
          break;
        }
      }
    } catch (err) {
      alert(err.message);
    }
  }
}
