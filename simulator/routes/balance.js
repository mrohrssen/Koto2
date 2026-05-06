import { Router } from 'express';

function isTerminalJob(job) {
  return ['completed', 'cancelled', 'errored'].includes(job?.status) && job?.jobId;
}

async function forwardJson(gameServerUrl, adminSecret, method, path, body) {
  const response = await fetch(`${gameServerUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': adminSecret
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({ error: response.statusText }));
  return { response, payload };
}

function mirrorTerminalResult(store, payload) {
  if (isTerminalJob(payload)) {
    store.saveBalanceRun(payload);
  }
}

export default function createBalanceRoutes(store, gameServerUrl, adminSecret) {
  const router = Router();

  router.post('/start', async (req, res) => {
    try {
      const { response, payload } = await forwardJson(
        gameServerUrl,
        adminSecret,
        'POST',
        '/api/admin/balance-simulations/start',
        req.body
      );
      mirrorTerminalResult(store, payload);
      res.status(response.status).json(payload);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/current', async (_req, res) => {
    try {
      const { response, payload } = await forwardJson(
        gameServerUrl,
        adminSecret,
        'GET',
        '/api/admin/balance-simulations/current'
      );
      mirrorTerminalResult(store, payload);
      res.status(response.status).json(payload);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/cancel', async (_req, res) => {
    try {
      const { response, payload } = await forwardJson(
        gameServerUrl,
        adminSecret,
        'POST',
        '/api/admin/balance-simulations/cancel'
      );
      mirrorTerminalResult(store, payload);
      res.status(response.status).json(payload);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/runs', (_req, res) => {
    try {
      res.json(store.getBalanceRuns());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
