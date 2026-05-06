import http from 'http';

/**
 * HTTP client for integration tests.
 * Makes real HTTP requests to a test app instance.
 */
export function createApiClient(port) {
  const baseUrl = `http://127.0.0.1:${port}`;
  let authToken = null;

  async function request(method, path, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const headers = {};
      let payload;

      if (body !== undefined) {
        payload = JSON.stringify(body);
        headers['content-type'] = 'application/json';
        headers['content-length'] = Buffer.byteLength(payload);
      }

      if (authToken) {
        headers['authorization'] = `Bearer ${authToken}`;
      }

      const req = http.request(url, { method, headers }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          resolve({ status: res.statusCode, body: parsed });
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    delete: (path) => request('DELETE', path),
    getState: () => request('GET', '/api/game/state'),
    createPlayer: (name = 'TestPlayer') => request('POST', '/api/game/create-player', { name }),
    claimDailyCrystals: () => request('POST', '/api/game/crystals/daily-login', {}),

    /** Set auth token for subsequent requests */
    setToken(token) { authToken = token; },

    /** Register + login, store token for subsequent requests */
    async loginAsNewUser(username = 'test-user', password = 'test-pass-123') {
      await request('POST', '/api/auth/register', {
        username, password, inviteCode: 'neo-tokyo-friends', aiDataSharingConsent: true
      });
      const res = await request('POST', '/api/auth/login', { username, password });
      if (res.body?.token) authToken = res.body.token;
      return res;
    }
  };
}
