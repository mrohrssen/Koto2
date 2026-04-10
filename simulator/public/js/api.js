/**
 * API client for the Koto Learning Simulator.
 */

export async function api(method, path, body) {
  const opts = {
    method,
    headers: {},
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errBody.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const profiles = {
  list: () => api('GET', '/api/profiles'),
  get: (id) => api('GET', `/api/profiles/${id}`),
  create: (name, config) => api('POST', '/api/profiles', { name, config }),
  update: (id, name, config) => api('PUT', `/api/profiles/${id}`, { name, config }),
  delete: (id) => api('DELETE', `/api/profiles/${id}`),
};

export const simulations = {
  start: (profileId) => api('POST', '/api/simulations/start', { profileId }),
  get: (id) => api('GET', `/api/simulations/${id}`),
  pause: (id) => api('POST', `/api/simulations/${id}/pause`),
  resume: (id) => api('POST', `/api/simulations/${id}/resume`),
};

export const results = {
  snapshots: (simId) => api('GET', `/api/results/${simId}/snapshots`),
  events: (simId, filters = {}) => {
    const params = new URLSearchParams();
    if (filters.day !== undefined) params.set('day', filters.day);
    if (filters.type !== undefined) params.set('type', filters.type);
    if (filters.limit !== undefined) params.set('limit', filters.limit);
    const qs = params.toString();
    return api('GET', `/api/results/${simId}/events${qs ? '?' + qs : ''}`);
  },
  eventCounts: (simId) => api('GET', `/api/results/${simId}/event-counts`),
  vocabulary: (simId) => api('GET', `/api/results/${simId}/vocabulary`),
  compare: (simIds) => api('POST', '/api/results/compare', { simIds }),
};
