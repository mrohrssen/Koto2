/**
 * Resilient HTTP wrapper for simulator API calls.
 * Never throws — always returns a result object.
 */
export function createSimCaller(baseUrl, jwtToken, logFn) {
  return async function simCall(method, path, body, context) {
    const url = `${baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json'
    };
    if (jwtToken) {
      headers['Authorization'] = `Bearer ${jwtToken}`;
    }

    const options = {
      method,
      headers
    };
    if (body !== undefined && body !== null) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      const responseText = await response.text();

      if (response.ok) {
        let data;
        try {
          data = JSON.parse(responseText);
        } catch {
          data = responseText;
        }
        return { ok: true, data };
      }

      // HTTP error (4xx/5xx)
      if (logFn) {
        logFn({
          type: 'api_error',
          path,
          status: response.status,
          body: responseText,
          context
        });
      }
      return { ok: false, status: response.status, error: responseText };

    } catch (err) {
      // Network error (fetch threw)
      if (logFn) {
        logFn({
          type: 'api_error',
          path,
          error: err.message,
          context
        });
      }
      return { ok: false, error: err.message };
    }
  };
}
