import express from 'express';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

import { createStore } from './db/store.js';
import createProfileRoutes from './routes/profiles.js';
import createSimulationRoutes from './routes/simulations.js';
import createResultRoutes from './routes/results.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Configuration ---
const PORT = process.env.SIM_PORT || 3100;
const GAME_SERVER_URL = process.env.GAME_SERVER_URL || 'http://localhost:3000';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const DB_PATH = process.env.SIM_DB_PATH || join(__dirname, 'data', 'simulator.db');

if (!ADMIN_SECRET) {
  console.warn('WARNING: ADMIN_SECRET not set. Simulation user creation will fail.');
}

// Ensure data directory exists
mkdirSync(dirname(DB_PATH), { recursive: true });

// --- Initialize store ---
const store = createStore(DB_PATH);

// --- Express app ---
const app = express();

app.use(express.json());
app.use(express.static(join(__dirname, 'public'), { etag: false, lastModified: false, maxAge: 0 }));

// --- API routes ---
app.use('/api/profiles', createProfileRoutes(store));
app.use('/api/simulations', createSimulationRoutes(store, GAME_SERVER_URL, ADMIN_SECRET));
app.use('/api/results', createResultRoutes(store));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', gameServer: GAME_SERVER_URL });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// --- Start server ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Simulator dashboard running at http://0.0.0.0:${PORT}`);
  console.log(`Game server target: ${GAME_SERVER_URL}`);
});

export default app;
