import { Application, Container } from 'pixi.js';
import { resizeParallax } from './parallax.js';
import { initParticles, initFlash, initVignette } from './effects.js';

let app = null;
let layers = {};
let resizeObserver = null;

// Debug: expose to console for live inspection
if (typeof window !== 'undefined') {
  window.__pixiApp = () => ({ app, layers });
}

/** @returns {{ app: Application, layers: Record<string, Container> }} */
export function getApp() {
  return { app, layers };
}

/**
 * Initialize the PixiJS battle stage inside the scene-area element.
 * Must be called once at app startup (async).
 */
export async function initApp() {
  const sceneArea = document.getElementById('scene-area');
  if (!sceneArea || app) {
    console.warn('[PixiApp] init skipped:', { sceneArea: !!sceneArea, appExists: !!app });
    return;
  }

  try {
  app = new Application();

  await app.init({
    backgroundAlpha: 0, // Transparent — lets DOM .scene-background show through when no parallax is loaded
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
    antialias: false,
    width: sceneArea.clientWidth,
    height: sceneArea.clientHeight,
  });

  // Insert canvas as first child so DOM overlays sit on top
  app.canvas.style.position = 'absolute';
  app.canvas.style.top = '0';
  app.canvas.style.left = '0';
  app.canvas.style.width = '100%';
  app.canvas.style.height = '100%';
  app.canvas.style.zIndex = '1'; // Above .scene-background (0), below .battle-stage DOM overlay (2)
  sceneArea.insertBefore(app.canvas, sceneArea.firstChild);
  console.log('[PixiApp] Canvas inserted:', app.canvas.width, 'x', app.canvas.height);

  // Create ordered layer containers
  layers = {
    background: new Container(),
    creatures: new Container(),
    effects: new Container(),
    labels: new Container(),
    overlay: new Container(),
  };
  app.stage.addChild(layers.background);
  app.stage.addChild(layers.creatures);
  app.stage.addChild(layers.effects);
  app.stage.addChild(layers.labels);
  app.stage.addChild(layers.overlay);

  // Initialize sub-modules
  initParticles();
  initFlash();
  initVignette();

  // Resize handling. Scene-owned formation ctxs reposition sprites via DOM
  // anchors on spawn/update — resize re-lays DOM first, and subsequent diff
  // passes pick up the new anchor positions. No explicit formation-resize
  // hook needed after Task 18.
  resizeObserver = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (width > 0 && height > 0) {
      app.renderer.resize(width, height);
      resizeParallax(width, height);
    }
  });
  resizeObserver.observe(sceneArea);

  // Per-frame ticker is owned by SceneManager (wired in public/game.js after initApp()).
  // It drives updateParallax and updateParticles via configure({ parallax: { update } }).

  console.log('[PixiApp] Init complete');
  } catch (err) {
    console.error('[PixiApp] Init FAILED:', err);
    app = null;
  }
}

/**
 * Destroy the PixiJS application and clean up.
 */
export function destroyApp() {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (!app) return;
  app.destroy(true, { children: true, texture: true });
  app = null;
  layers = {};
}
