#!/usr/bin/env node
/**
 * Bunpro API Explorer
 *
 * Tests the undocumented Bunpro frontend API to see what data we can get
 * for grammar review questions.
 *
 * Usage:
 *   1. Log into bunpro.jp in your browser
 *   2. Open DevTools > Network tab
 *   3. Go to Settings > Account
 *   4. Look for the 'frontend_api_token' in cookies or response headers
 *   5. Run: BUNPRO_TOKEN=your_token node scripts/test-bunpro-api.mjs
 *
 * Alternative: If you have your session cookie, you can try:
 *   BUNPRO_COOKIE="_bunpro_session=xxx" node scripts/test-bunpro-api.mjs
 */

const BUNPRO_BASE = 'https://api.bunpro.jp';

const token = process.env.BUNPRO_TOKEN;
const cookie = process.env.BUNPRO_COOKIE;

if (!token && !cookie) {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    Bunpro API Explorer                         ║
╠════════════════════════════════════════════════════════════════╣
║  To use this script, you need authentication from Bunpro.      ║
║                                                                ║
║  Option 1: Frontend API Token                                  ║
║  ─────────────────────────────────────────────────────────────║
║  1. Log into bunpro.jp in your browser                        ║
║  2. Open DevTools (F12) > Network tab                         ║
║  3. Navigate to any page and look for API requests            ║
║  4. Find the 'Authorization' header - it looks like:          ║
║     "Token token=abc123..."                                   ║
║  5. Copy just the token part (after "Token token=")           ║
║  6. Run: BUNPRO_TOKEN=abc123 node scripts/test-bunpro-api.mjs ║
║                                                                ║
║  Option 2: Session Cookie                                      ║
║  ─────────────────────────────────────────────────────────────║
║  1. Log into bunpro.jp                                        ║
║  2. DevTools > Application > Cookies > bunpro.jp              ║
║  3. Copy the '_bunpro_session' cookie value                   ║
║  4. Run: BUNPRO_COOKIE="_bunpro_session=xxx" \\               ║
║          node scripts/test-bunpro-api.mjs                     ║
╚════════════════════════════════════════════════════════════════╝
`);
  process.exit(1);
}

// Build headers based on what auth we have
function getHeaders() {
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'JRPG-BunproExplorer/1.0'
  };

  if (token) {
    headers['Authorization'] = `Token token=${token}`;
  }
  if (cookie) {
    headers['Cookie'] = cookie;
  }

  return headers;
}

// Test an endpoint and pretty-print the result
async function testEndpoint(name, path, method = 'GET', body = null) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`${method} ${path}`);
  console.log('─'.repeat(60));

  try {
    const options = {
      method,
      headers: getHeaders()
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${BUNPRO_BASE}${path}`, options);

    console.log(`Status: ${response.status} ${response.statusText}`);

    // Log interesting headers
    const interestingHeaders = ['content-type', 'x-request-id', 'set-cookie'];
    for (const h of interestingHeaders) {
      const val = response.headers.get(h);
      if (val) console.log(`${h}: ${val.substring(0, 100)}...`);
    }

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const data = await response.json();
        console.log('\nResponse (JSON):');
        console.log(JSON.stringify(data, null, 2).substring(0, 3000));
        if (JSON.stringify(data).length > 3000) {
          console.log('... (truncated)');
        }
        return data;
      } else {
        const text = await response.text();
        console.log(`\nResponse (${contentType}):`);
        console.log(text.substring(0, 500));
        if (text.length > 500) console.log('... (truncated)');
        return text;
      }
    } else {
      const text = await response.text();
      console.log(`\nError response: ${text.substring(0, 500)}`);
      return null;
    }
  } catch (error) {
    console.log(`\nError: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║              Bunpro API Exploration Results                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  // Test user endpoint first to verify auth works
  const user = await testEndpoint('User Info', '/api/frontend/user');

  if (!user) {
    console.log('\n⚠️  Authentication failed. Please check your token/cookie.');
    process.exit(1);
  }

  console.log('\n✓ Authentication successful!\n');

  // Test the endpoints we're most interested in (with user/ prefix based on working example)
  await testEndpoint('User Due Reviews', '/api/frontend/user/due');
  await testEndpoint('User Queue', '/api/frontend/user/queue');
  await testEndpoint('User Reviews', '/api/frontend/user/reviews');

  // Try study queue endpoint
  await testEndpoint('Study Queue', '/api/frontend/study_queue');

  // Grammar points
  await testEndpoint('Grammar Points', '/api/frontend/grammar_points');

  // Try to get a review session
  await testEndpoint('Review Session', '/api/frontend/reviews/session');

  console.log('\n' + '═'.repeat(60));
  console.log('Exploration complete!');
  console.log('═'.repeat(60));
}

main().catch(console.error);
