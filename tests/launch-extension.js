/**
 * Launch Chromium with the unpacked extension loaded.
 * Modern Chrome disables --load-extension unless Puppeteer's
 * enableExtensions + pipe path is used.
 */
import puppeteer from 'puppeteer-core';
import { resolveBrowserPath } from './browser-path.js';

/**
 * @param {string} extPath Absolute path to extension root
 * @param {object} [opts]
 * @returns {Promise<import('puppeteer-core').Browser>}
 */
export async function launchWithExtension(extPath, opts = {}) {
  const executablePath = opts.executablePath || resolveBrowserPath();
  const headless = opts.headless ?? false; // headed + xvfb is most reliable for MV3 SW
  const browser = await puppeteer.launch({
    executablePath,
    headless,
    pipe: true,
    enableExtensions: [extPath],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--window-size=1280,900',
      ...(opts.args || [])
    ]
  });

  // Puppeteer's enableExtensions Promise.all wrapper may not await installs;
  // install explicitly so the service worker is registered before tests proceed.
  try {
    await browser.installExtension(extPath);
  } catch {
    // Already installed via enableExtensions — fine
  }

  return browser;
}

export async function waitForExtensionWorker(browser, { timeoutMs = 15000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const target = browser.targets().find((t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'));
    if (target) {
      const extId = new URL(target.url()).hostname;
      return { workerTarget: target, extId };
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Service worker target not found');
}
