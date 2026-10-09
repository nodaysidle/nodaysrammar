/**
 * Resolve a Chromium-based browser binary for Puppeteer tests.
 * Prefer NODAYSRAMMAR_BROWSER / CHROME_PATH / CHROMIUM_PATH, then common paths.
 */
import fs from 'node:fs';

const CANDIDATES = [
  process.env.NODAYSRAMMAR_BROWSER,
  process.env.CHROME_PATH,
  process.env.CHROMIUM_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/brave-origin',
  '/usr/bin/brave-browser'
].filter(Boolean);

export function resolveBrowserPath() {
  for (const candidate of CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // continue
    }
  }
  throw new Error(
    'No Chromium browser found. Set NODAYSRAMMAR_BROWSER (or CHROME_PATH) to a Chrome/Chromium binary.'
  );
}
