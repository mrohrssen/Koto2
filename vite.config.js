import { defineConfig } from 'vite';
import { copyFileSync, cpSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';

/**
 * Vite plugin to handle static files that need stable (unhashed) URLs.
 * PWA manifest, service worker, and app icons must keep their exact paths.
 */
function staticFiles() {
  return {
    name: 'static-files',
    closeBundle() {
      const dist = 'dist';
      if (!existsSync(dist)) return;

      // Copy static files that need stable URLs
      copyFileSync('public/sw.js', `${dist}/sw.js`);
      copyFileSync('public/manifest.json', `${dist}/manifest.json`);
      copyFileSync('public/admin-word-exposures.html', `${dist}/admin-word-exposures.html`);
      copyFileSync('public/admin-frame-audit.html', `${dist}/admin-frame-audit.html`);
      if (existsSync('public/dev-safe-area.css')) {
        copyFileSync('public/dev-safe-area.css', `${dist}/dev-safe-area.css`);
      }

      // Copy all game assets (sprites, backgrounds, audio, icons, etc.)
      cpSync('public/assets', `${dist}/assets`, { recursive: true });

      // Fix HTML: restore unhashed paths for PWA assets
      const htmlPath = `${dist}/index.html`;
      if (existsSync(htmlPath)) {
        let html = readFileSync(htmlPath, 'utf-8');
        html = html.replace(/href="\/assets\/manifest-[^"]+\.json"/, 'href="/manifest.json"');
        html = html.replace(/href="\/assets\/app-180-[^"]+\.webp"/, 'href="/assets/icons/app-180.webp"');
        writeFileSync(htmlPath, html);
      }
    }
  };
}

export default defineConfig({
  root: 'public',
  publicDir: false,
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  plugins: [staticFiles()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/assets': 'http://localhost:3000',
      '/sw.js': 'http://localhost:3000',
      '/manifest.json': 'http://localhost:3000',
      '/dev-safe-area.css': 'http://localhost:3000'
    }
  }
});
