import { apiUrl } from '../api.js';
import { setAnalyticsUser, trackEvent } from '../analytics.js';

let currentTab = 'login';
let authenticatedPrincipalId = null;
let reauthenticationRequest = null;

const SAME_ACCOUNT_RECOVERY_ERROR = 'Log in to the same account to recover this run. Creating or switching accounts is not allowed.';

function captureAuthenticatedPrincipal(user) {
  if (typeof user?.id === 'string' && user.id.length > 0) {
    authenticatedPrincipalId = user.id;
  }
}

/**
 * Initialize auth UI event listeners
 * @param {{ onAuthenticated: function }} callbacks
 */
export function init(callbacks) {
  // Show session expired message if redirected from 401
  const expiredMsg = sessionStorage.getItem('sessionExpiredMsg');
  if (expiredMsg) {
    sessionStorage.removeItem('sessionExpiredMsg');
    const toast = document.createElement('div');
    toast.className = 'auth-toast';
    toast.textContent = expiredMsg;
    const container = document.querySelector('.auth-container') || document.body;
    container.prepend(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  const tabs = document.querySelectorAll('.auth-tab');
  const submitBtn = document.getElementById('auth-submit');
  const aiConsent = document.getElementById('auth-ai-consent');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      currentTab = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      if (currentTab === 'register') {
        submitBtn.textContent = 'Register';
        document.getElementById('auth-password').autocomplete = 'new-password';
        aiConsent.classList.remove('hidden');
      } else {
        submitBtn.textContent = 'Login';
        document.getElementById('auth-password').autocomplete = 'current-password';
        aiConsent.classList.add('hidden');
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
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

  try {
    const res = await fetch(apiUrl('/api/auth/me'), { headers });
    if (res.ok) {
      const user = await res.json();
      captureAuthenticatedPrincipal(user);
      return true;
    }
    if (token) removeToken();
    return false;
  } catch {
    return false;
  }
}

export async function getCurrentUser() {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch(apiUrl('/api/auth/me'), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const user = await res.json();
    captureAuthenticatedPrincipal(user);
    return user;
  } catch {
    return null;
  }
}

export function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
}

export function hideAuthScreen() {
  document.getElementById('auth-screen').classList.add('hidden');
}

export function requestReauthentication() {
  showAuthScreen();
  if (reauthenticationRequest) return reauthenticationRequest.promise;
  if (!authenticatedPrincipalId) {
    showError('Your previous account could not be verified. Log in again from the main sign-in screen.');
    return Promise.resolve(false);
  }
  const principalId = authenticatedPrincipalId;
  let resolveRequest;
  const promise = new Promise(resolve => { resolveRequest = resolve; });
  reauthenticationRequest = { principalId, promise, resolve: resolveRequest };
  return promise;
}

export function getToken() {
  return localStorage.getItem('authToken');
}

export function logout() {
  localStorage.removeItem('authToken');
  authenticatedPrincipalId = null;
  if (reauthenticationRequest) {
    const { resolve } = reauthenticationRequest;
    reauthenticationRequest = null;
    resolve(false);
  }
}

// ---- Internal ----

function removeToken() {
  localStorage.removeItem('authToken');
}

function storeToken(token) {
  localStorage.setItem('authToken', token);
}

async function handleSubmit(callbacks) {
  if (reauthenticationRequest && currentTab === 'register') {
    showError(SAME_ACCOUNT_RECOVERY_ERROR);
    return;
  }

  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;

  if (!username || !password) {
    showError('Username and password required');
    return;
  }

  const aiDataSharingConsent = document.getElementById('auth-ai-consent-checkbox')?.checked ?? false;
  if (currentTab === 'register' && !aiDataSharingConsent) {
    showError('AI data sharing consent is required to play Koto');
    return;
  }

  hideError();

  let fetchOptions;
  if (currentTab === 'register') {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);
    formData.append('aiDataSharingConsent', String(aiDataSharingConsent));
    fetchOptions = { method: 'POST', body: formData };
  } else {
    fetchOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    };
  }

  try {
    const res = await fetch(
      apiUrl(currentTab === 'login' ? '/api/auth/login' : '/api/auth/register'),
      fetchOptions
    );
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Authentication failed');
      return;
    }

    if (
      reauthenticationRequest
      && data.user?.id !== reauthenticationRequest.principalId
    ) {
      showError(SAME_ACCOUNT_RECOVERY_ERROR);
      return;
    }

    storeToken(data.token);
    captureAuthenticatedPrincipal(data.user);
    await setAnalyticsUser(data.user);
    await trackEvent(currentTab === 'login' ? 'koto_login' : 'koto_sign_up', {
      method: 'password'
    });
    hideAuthScreen();
    if (reauthenticationRequest) {
      const { resolve } = reauthenticationRequest;
      reauthenticationRequest = null;
      resolve(true);
      return;
    }
    if (callbacks.onAuthenticated) {
      await callbacks.onAuthenticated(data.user);
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
