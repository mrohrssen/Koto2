/**
 * Hash-based router for the Koto Learning Simulator SPA.
 */
import { renderProfiles } from './profiles.js';
import { renderResults } from './results.js';
import { renderCompare } from './compare.js';
import { renderBalance } from './balance.js';

const appEl = document.getElementById('app');

const routes = {
  profiles: () => renderProfiles(appEl),
  results: (params) => renderResults(appEl, params),
  compare: () => renderCompare(appEl),
  balance: () => renderBalance(appEl),
};

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, '') || 'profiles';
  const parts = hash.split('/');
  const view = parts[0];
  const params = {};

  if (view === 'results' && parts[1]) {
    params.simId = Number(parts[1]);
  }

  return { view, params };
}

function updateNav(activeView) {
  document.querySelectorAll('.nav-link').forEach(link => {
    const linkView = link.dataset.view;
    link.classList.toggle('active', linkView === activeView);
  });
}

function route() {
  const { view, params } = parseHash();
  updateNav(view);

  const handler = routes[view];
  if (handler) {
    handler(params);
  } else {
    appEl.innerHTML = '<div class="empty-state">Page not found</div>';
  }
}

window.addEventListener('hashchange', route);

// Expose for programmatic navigation
window.navigate = function(hash) {
  location.hash = hash;
};

// Initial route
route();
