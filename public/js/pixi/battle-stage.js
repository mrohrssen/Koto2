/**
 * @file battle-stage.js — PixiJS Application init, resize, layer management
 *
 * Creates a PixiJS canvas inside .scene-area with four ordered layers:
 * background (parallax), creatures, effects, overlay.
 * Handles resize via ResizeObserver.
 *
 * Parallax integration: docs/superpowers/plans/2026-04-01-pixijs-battle-stage.md (Task 3).
 */

import { Application, Container } from 'pixi.js';
import { updateParallax, resizeParallax } from './parallax.js';
import { initFormations, updateFormations, resizeFormations } from './formation.js';
import { initFonts } from './text.js';
import { initParticles, updateParticles, initFlash, isFrozen } from './effects.js';

let app = null;
let layers = {};
let resizeObserver = null;

/** @returns {{ app: Application, layers: Record<string, Container> }} */
export function getStage() {
  return { app, layers };
}

// Debug: expose to console for live inspection
if (typeof window !== 'undefined') {
  window.__pixiStage = () => ({ app, layers });
}

/**
 * Initialize the PixiJS battle stage inside the scene-area element.
 * Must be called once at app startup (async).
 */
export async function initBattleStage() {
  const sceneArea = document.getElementById('scene-area');
  if (!sceneArea || app) return;

  app = new Application();

  await app.init({
    backgroundAlpha: 0,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    antialias: false,
    width: sceneArea.clientWidth,
    height: sceneArea.clientHeight,
  });

  // Insert canvas as first child so DOM overlays sit on top.
  // z-index 1 ensures it renders above .scene-background (z-index 0).
  app.canvas.style.position = 'absolute';
  app.canvas.style.top = '0';
  app.canvas.style.left = '0';
  app.canvas.style.width = '100%';
  app.canvas.style.height = '100%';
  app.canvas.style.zIndex = '1';
  sceneArea.insertBefore(app.canvas, sceneArea.firstChild);

  // Create ordered layer containers
  layers = {
    background: new Container(),
    creatures: new Container(),
    effects: new Container(),
    overlay: new Container(),
  };
  app.stage.addChild(layers.background);
  app.stage.addChild(layers.creatures);
  app.stage.addChild(layers.effects);
  app.stage.addChild(layers.overlay);

  initFormations();
  initFonts();
  initParticles();
  initFlash();

  // Resize handling
  resizeObserver = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (width > 0 && height > 0) {
      app.renderer.resize(width, height);
      resizeParallax(width, height);
      void resizeFormations(width, height);
    }
  });
  resizeObserver.observe(sceneArea);

  app.ticker.add((ticker) => {
    const deltaMS = ticker.elapsedMS;
    updateParticles(deltaMS);
    if (!isFrozen()) {
      updateParallax(ticker.deltaTime);
      updateFormations(ticker.deltaTime);
    }
  });
}

/**
 * Destroy the PixiJS application and clean up.
 */
export function destroyBattleStage() {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (!app) return;
  app.destroy(true, { children: true, texture: true });
  app = null;
  layers = {};
}
