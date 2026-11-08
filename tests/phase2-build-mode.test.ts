import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import viteConfigFn from '../vite.config';

describe('Phase 2: Build-mode split (web/PWA vs desktop)', () => {
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

  describe('vite.config.ts mode awareness and deterministic server', () => {
    it('sets base to / and server to deterministic port 5173 with strictPort', async () => {
      const config = await (typeof viteConfigFn === 'function'
        ? viteConfigFn({ mode: 'desktop', command: 'build' })
        : viteConfigFn);

      expect(config.base).toBe('/');
      expect(config.server?.port).toBe(5173);
      expect(config.server?.strictPort).toBe(true);
    });

    it('exposes __APP_VERSION__ from package.json in define block', async () => {
      const config = await (typeof viteConfigFn === 'function'
        ? viteConfigFn({ mode: 'desktop', command: 'build' })
        : viteConfigFn);

      expect(config.define?.__APP_VERSION__).toBe(JSON.stringify(pkg.version));
    });

    it('omits VitePWA plugin when mode is desktop', async () => {
      const desktopConfig = await (typeof viteConfigFn === 'function'
        ? viteConfigFn({ mode: 'desktop', command: 'build' })
        : viteConfigFn);

      const pluginNames = (desktopConfig.plugins || [])
        .flat()
        .map((p: any) => p && p.name)
        .filter(Boolean);

      // VitePWA plugin names usually start with 'vite-plugin-pwa'
      const hasPwa = pluginNames.some((name: string) => name.includes('pwa'));
      expect(hasPwa).toBe(false);
    });

    it('includes VitePWA plugin when mode is web/production', async () => {
      const webConfig = await (typeof viteConfigFn === 'function'
        ? viteConfigFn({ mode: 'production', command: 'build' })
        : viteConfigFn);

      const pluginNames = (webConfig.plugins || [])
        .flat()
        .map((p: any) => p && p.name)
        .filter(Boolean);

      const hasPwa = pluginNames.some((name: string) => name.includes('pwa'));
      expect(hasPwa).toBe(true);
    });
  });

  describe('package.json metadata and scripts', () => {
    it('contains electron-builder expected metadata', () => {
      expect(pkg.description).toBeDefined();
      expect(pkg.author).toBe('MY-Jafari');
      expect(pkg.homepage).toBeDefined();
      expect(pkg.license).toBe('Apache-2.0');
      expect(pkg.main).toBe('electron/main.cjs');
      expect(pkg.type).toBe('module');
    });

    it('contains build:desktop, desktop:dev, and desktop:pack scripts', () => {
      expect(pkg.scripts['build:desktop']).toBe('tsc && vite build --mode desktop');
      expect(pkg.scripts['desktop:dev']).toBe('concurrently -k "vite" "wait-on http://localhost:5173 && electron ."');
      expect(pkg.scripts['desktop:pack']).toBe('npm run build:desktop && electron-builder --win --publish never');
    });
  });

  describe('Type declaration and About row in SettingsDialog', () => {
    it('declares __APP_VERSION__ in src/vite-env.d.ts', () => {
      const envDts = fs.readFileSync(path.resolve(process.cwd(), 'src/vite-env.d.ts'), 'utf-8');
      expect(envDts).toContain('declare const __APP_VERSION__: string;');
    });

    it('includes About and Version localization keys in en and fa', () => {
      const en = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/i18n/locales/en.json'), 'utf-8'));
      const fa = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/i18n/locales/fa.json'), 'utf-8'));

      expect(en.settings.about).toBeDefined();
      expect(en.settings.version).toBeDefined();
      expect(fa.settings.about).toBeDefined();
      expect(fa.settings.version).toBeDefined();
    });
  });
});
