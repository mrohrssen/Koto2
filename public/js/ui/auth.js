/**
 * @file auth.js - Authentication UI
 *
 * PURPOSE:
 * Manages user authentication interface including login/register forms,
 * JWT token storage, and auth state checking. Shows auth screen on app
 * load if user is not authenticated.
 *
 * KEY EXPORTS:
 * - init({ onAuthenticated }): Setup form handlers and callbacks
 * - checkAuth(): Verify token validity with server, returns boolean
 * - showAuthScreen(): Display the auth overlay
 * - hideAuthScreen(): Hide the auth overlay
 * - getToken(): Retrieve stored JWT from localStorage
 * - logout(): Clear stored token
 *
 * DEPENDENCIES:
 * - None (standalone module)
 *
 * FLOW:
 * 1. On app load, checkAuth() validates existing token
 * 2. If invalid/missing, showAuthScreen() displays login form
 * 3. User submits credentials, server returns JWT
 * 4. Token stored in localStorage, onAuthenticated callback fires
 * 5. Registration requires invite code
 */

import { apiUrl } from '../api.js';

let currentTab = 'login';

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
        document.getElementById('wordListField').style.display = '';
      } else {
        inviteField.classList.add('hidden');
        submitBtn.textContent = 'Login';
        document.getElementById('auth-password').autocomplete = 'current-password';
        document.getElementById('wordListField').style.display = 'none';
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
    if (res.ok) return true;
    if (token) removeToken();
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

  let fetchOptions;
  if (currentTab === 'register') {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);
    formData.append('inviteCode', inviteCode);
    const fileInput = document.getElementById('word-list-upload');
    if (fileInput.files.length > 0) {
      formData.append('wordList', fileInput.files[0]);
    }
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
