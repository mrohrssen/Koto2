/**
 * Dialogue log viewer.
 * Groups dialogue events by day and renders them as a structured log.
 */

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Render dialogue events grouped by day.
 * @param {HTMLElement} container - Target element
 * @param {Array} events - Array of event objects with { day, run, room, event_type, data }
 */
export function renderDialogueLog(container, events) {
  if (!events || events.length === 0) {
    container.innerHTML = '<div class="empty-state">No dialogue events recorded.</div>';
    return;
  }

  // Group by day
  const byDay = new Map();
  for (const evt of events) {
    const day = evt.day || 0;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(evt);
  }

  const log = document.createElement('div');
  log.className = 'dialogue-log';

  for (const [day, dayEvents] of byDay) {
    const dayHeader = document.createElement('div');
    dayHeader.className = 'day-header';
    dayHeader.textContent = `Day ${day}`;
    log.appendChild(dayHeader);

    for (const evt of dayEvents) {
      const data = evt.data || {};
      const entry = document.createElement('div');
      entry.className = 'dialogue-entry';

      const source = data.source || data.npc_type || evt.event_type || 'unknown';
      const jaText = data.japanese || data.text || data.line || '';
      const runRoom = `Run ${evt.run || '?'}, Room ${evt.room || '?'}`;

      entry.innerHTML = `
        <div>
          <span class="dialogue-source">${esc(source)}</span>
          <span class="dialogue-meta">${esc(runRoom)}</span>
        </div>
        ${jaText ? `<div class="dialogue-text">${esc(jaText)}</div>` : ''}
      `;

      log.appendChild(entry);
    }
  }

  container.innerHTML = '';
  container.appendChild(log);
}
