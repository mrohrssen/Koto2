/**
 * Authenticate a Playwright page by registering/logging in via HTTP
 * and seeding the browser with the auth token.
 */
export async function authenticatePage(page, request, {
  username = `visual-${Date.now()}`,
  password = 'password123'
} = {}) {
  let token = null;

  const register = await request.post('/api/auth/register', {
    data: { username, password, inviteCode: 'neo-tokyo-friends' }
  });
  const registerBody = await register.json().catch(() => null);
  token = registerBody?.token || null;

  if (!token) {
    const login = await request.post('/api/auth/login', {
      data: { username, password }
    });
    const loginBody = await login.json();
    token = loginBody.token;
  }

  await page.addInitScript((authToken) => {
    localStorage.setItem('authToken', authToken);
  }, token);

  return token;
}
