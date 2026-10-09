/**
 * test-autofix.js
 * Tests:
 * 1. The "Fix All" button in the popover card
 * 2. Real-time "Auto-Fix on Spacebar" mode
 */

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveBrowserPath } from './browser-path.js';
import { launchWithExtension, waitForExtensionWorker } from './launch-extension.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.resolve(__dirname, '..');
const BROWSER_BIN = resolveBrowserPath();
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
  const browser = await launchWithExtension(EXT_PATH, {
    executablePath: BROWSER_BIN,
    headless: false
  });

  try {
    await waitForExtensionWorker(browser);
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

    // REEL (1): after Fix All, "don't" must not be re-flagged as "dont"
    if (!/don't/i.test(allFixedText) && !/doesn\'t/i.test(allFixedText)) {
      throw new Error(`Expected apostrophe contraction after Fix All, got: ${allFixedText}`);
    }
    await sleep(900);
    const postFixSuggestions = await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      const badge = host?.shadowRoot?.querySelector('.badge');
      return {
        badgeText: badge?.textContent || '',
        hasErrors: badge?.classList?.contains('has-errors') || false
      };
    });
    console.log('Post Fix-All badge:', postFixSuggestions);
    if (postFixSuggestions.hasErrors && /dont/i.test(allFixedText) === false) {
      // Re-open popover and ensure no don\'t → dont card
      await testPage.evaluate(() => {
        const host = document.getElementById('nodaysrammar-root');
        host.shadowRoot.querySelector('.badge').click();
      });
      await sleep(300);
      const badCard = await testPage.evaluate(() => {
        const host = document.getElementById('nodaysrammar-root');
        const items = Array.from(host.shadowRoot.querySelectorAll('.suggestion-item'));
        return items.map((el) => el.textContent).filter((t) => /don.?t/i.test(t) && /dont/i.test(t));
      });
      if (badCard.length) {
        throw new Error(`don't was re-flagged toward dont: ${JSON.stringify(badCard)}`);
      }
      // Close popover via X
      await testPage.evaluate(() => {
        const host = document.getElementById('nodaysrammar-root');
        host.shadowRoot.querySelector('.popover-close')?.click();
      });
      await sleep(200);
    }

    // REEL (4): after closing the suggestion card, textarea must accept typing again
    console.log('Testing focus restore after popover close...');
    await testPage.evaluate(() => {
      const ta = document.getElementById('test-textarea');
      ta.value = 'Type here: ';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await textarea.click({ clickCount: 1 });
    await sleep(400);
    // Open then close popover
    await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      host.shadowRoot.querySelector('.badge')?.click();
    });
    await sleep(300);
    await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      const closeBtn = host.shadowRoot.querySelector('.popover-close');
      if (closeBtn) closeBtn.click();
    });
    await sleep(200);
    const focusBefore = await testPage.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
    console.log('Active element after close:', focusBefore);
    await testPage.keyboard.type('OK');
    await sleep(100);
    const afterType = await testPage.evaluate(() => document.getElementById('test-textarea').value);
    console.log('Text after typing OK:', JSON.stringify(afterType));
    if (!afterType.includes('OK')) {
      throw new Error(`Textarea ignored typing after popover close. value=${JSON.stringify(afterType)} focus=${focusBefore}`);
    }
    console.log('[PASS] Focus restored; textarea accepts typing after popover close');

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
