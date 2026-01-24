/**
 * Auth UI Module
 * Handles login/register forms and token management
 */

let currentTab = 'login';

/**
 * Initialize auth UI event listeners
 * @param {{ onAuthenticated: function }} callbacks
 */
export function init(callbacks) {
  const tabs = document.querySelectorAll('.auth-tab');
  const inviteField = document.getElementById('auth-invite');
  const submitBtn = document.getElementById('auth-submit');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      currentTab = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      if (currentTab === 'register') {
        inviteField.classList.remove('hidden');
        submitBtn.textContent = 'Register';
        document.getElementById('auth-password').autocomplete = 'new-password';
      } else {
        inviteField.classList.add('hidden');
        submitBtn.textContent = 'Login';
        document.getElementById('auth-password').autocomplete = 'current-password';
      }
      hideError();
    });
  });

  submitBtn.addEventListener('click', () => handleSubmit(callbacks));

  document.getElementById('auth-fields').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSubmit(callbacks);
  });
}

/**
 * Check if user has valid auth token
 * @returns {Promise<boolean>}
 */
export async function checkAuth() {
  const token = getToken();
  if (!token) return false;

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) return true;
    removeToken();
    return false;
  } catch {
    return false;
  }
}

export function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
}

export function hideAuthScreen() {
  document.getElementById('auth-screen').classList.add('hidden');
}

export function getToken() {
  return localStorage.getItem('authToken');
}

export function logout() {
  localStorage.removeItem('authToken');
}

// ---- Internal ----

function removeToken() {
  localStorage.removeItem('authToken');
}

function storeToken(token) {
  localStorage.setItem('authToken', token);
}

async function handleSubmit(callbacks) {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const inviteCode = document.getElementById('auth-invite').value.trim();

  if (!username || !password) {
    showError('Username and password required');
    return;
  }

  if (currentTab === 'register' && !inviteCode) {
    showError('Invite code required');
    return;
  }

  hideError();
  const endpoint = currentTab === 'login' ? '/api/auth/login' : '/api/auth/register';
  const body = currentTab === 'login'
    ? { username, password }
    : { username, password, inviteCode };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Authentication failed');
      return;
    }

    storeToken(data.token);
    hideAuthScreen();
    if (callbacks.onAuthenticated) {
      callbacks.onAuthenticated(data.user);
    }
  } catch (err) {
    showError('Network error. Please try again.');
  }
}

function showError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError() {
  const el = document.getElementById('auth-error');
  el.classList.add('hidden');
}
