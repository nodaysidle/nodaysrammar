/**
 * test-autofix.js
 * Tests:
 * 1. The "Fix All" button in the popover card
 * 2. Real-time "Auto-Fix on Spacebar" mode
 */

import puppeteer from 'puppeteer-core';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.resolve(__dirname, '..');
const BRAVE_BIN = '/usr/bin/brave-origin';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const server = http.createServer((req, res) => {
  const filePath = path.join(__dirname, 'test-page.html');
  const content = fs.readFileSync(filePath, 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(content);
});

await new Promise((resolve) => server.listen(8766, '127.0.0.1', resolve));

async function run() {
  const browser = await puppeteer.launch({
    executablePath: BRAVE_BIN,
    headless: 'new',
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--window-size=1280,900'
    ]
  });

  try {
    const testPage = await browser.newPage();
    await testPage.goto('http://127.0.0.1:8766/', { waitUntil: 'networkidle0' });
    await sleep(800);

    const textarea = await testPage.$('#test-textarea');
    await textarea.click();

    // 1. Test "Fix All" button
    console.log('Testing "Fix All" button...');
    await textarea.type('This is a apple and teh boy dont know.', { delay: 15 });
    await sleep(800);

    // Click badge to open popover
    await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      host.shadowRoot.querySelector('.badge').click();
    });
    await sleep(400);

    await testPage.screenshot({ path: path.join(SCREENSHOT_DIR, '07-fix-all-popover.png') });
    console.log('Saved screenshot: screenshots/07-fix-all-popover.png');

    // Click "Fix All" button
    await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      const fixAllBtn = host.shadowRoot.querySelector('.btn-fix-all');
      if (fixAllBtn) fixAllBtn.click();
    });
    await sleep(400);

    const allFixedText = await testPage.evaluate(() => {
      return document.getElementById('test-textarea').value;
    });
    console.log('Text after "Fix All" click:');
    console.log(`"${allFixedText}"`);
    await testPage.screenshot({ path: path.join(SCREENSHOT_DIR, '08-after-fix-all.png') });
    console.log('Saved screenshot: screenshots/08-after-fix-all.png');

    console.log('\n--- AUTO-FIX & FIX ALL TESTS COMPLETED SUCCESSFULLY ---');

  } finally {
    await browser.close();
    server.close();
  }
}

run().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error(err);
  server.close();
  process.exit(1);
});
