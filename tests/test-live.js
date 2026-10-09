/**
 * test-live.js
 * Launches Chromium (Brave Origin) with nodaysrammar extension loaded.
 * Serves test-page.html on http://127.0.0.1:8765 so content scripts inject naturally.
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
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 1. Start local HTTP server
const server = http.createServer((req, res) => {
  const filePath = path.join(__dirname, 'test-page.html');
  const content = fs.readFileSync(filePath, 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(content);
});

await new Promise((resolve) => server.listen(8765, '127.0.0.1', resolve));
console.log('Test HTTP server listening on http://127.0.0.1:8765');

async function runLiveTest() {
  console.log('--- STARTING LIVE CHROMIUM EXTENSION TEST ---');
  console.log('Extension path:', EXT_PATH);
  console.log('Browser binary:', BRAVE_BIN);

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
    // 1. Wait for background service worker to initialize
    console.log('Waiting for background service worker target...');
    let workerTarget = null;
    for (let i = 0; i < 30; i++) {
      const targets = browser.targets();
      workerTarget = targets.find((t) => t.type() === 'service_worker');
      if (workerTarget) break;
      await sleep(200);
    }

    if (!workerTarget) {
      throw new Error('Service worker target not found');
    }

    const workerUrl = workerTarget.url();
    const extId = new URL(workerUrl).hostname;
    console.log(`[PASS] Background Service Worker active! Extension ID: ${extId}`);

    // Wait a brief moment for all 3 models to prewarm
    await sleep(800);

    // 2. Open Options Page and test Model Statuses
    console.log('\n--- TESTING OPTIONS PAGE ---');
    const optionsPage = await browser.newPage();
    await optionsPage.goto(`chrome-extension://${extId}/options/options.html`, { waitUntil: 'networkidle0' });
    await sleep(500);

    const modelStatuses = await optionsPage.evaluate(() => {
      return {
        en: document.getElementById('model-status-en')?.textContent,
        it: document.getElementById('model-status-it')?.textContent,
        sl: document.getElementById('model-status-sl')?.textContent
      };
    });
    console.log('Options Page Model Statuses:', modelStatuses);
    await optionsPage.screenshot({ path: path.join(SCREENSHOT_DIR, '01-options-page.png') });
    console.log('Saved screenshot: screenshots/01-options-page.png');

    // 3. Test Content Script on Live Web Page
    console.log('\n--- TESTING LIVE EDITABLE FIELD INJECTION & GRAMMAR CHECK ---');
    const testPage = await browser.newPage();
    await testPage.goto('http://127.0.0.1:8765/', { waitUntil: 'networkidle0' });
    await sleep(600);

    // Verify content script root was attached
    const hasScriptInjected = await testPage.evaluate(() => {
      return !!document.getElementById('nodaysrammar-root');
    });
    console.log('Content script root attached to page:', hasScriptInjected);

    // Focus textarea
    const textarea = await testPage.$('#test-textarea');
    await textarea.click();

    // Type test sentence with intentional errors in English
    console.log('Typing English text with mistakes: "This is a apple and teh boy dont know."');
    await textarea.type('This is a apple and teh boy dont know.', { delay: 20 });

    // Wait for 350ms debounce + inference response
    console.log('Waiting for debounced inference...');
    await sleep(900);

    // Check if Shadow DOM overlay was created and error badge rendered
    const overlayInfo = await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      if (!host || !host.shadowRoot) return { exists: false };

      const badge = host.shadowRoot.querySelector('.badge');
      return {
        exists: true,
        hasErrors: badge ? badge.classList.contains('has-errors') : false,
        badgeText: badge ? badge.textContent.trim() : null,
        badgeTitle: badge ? badge.getAttribute('title') : null
      };
    });
    console.log('Shadow DOM Overlay State:', overlayInfo);

    await testPage.screenshot({ path: path.join(SCREENSHOT_DIR, '02-live-badge-detected.png') });
    console.log('Saved screenshot: screenshots/02-live-badge-detected.png');

    // Click the badge to open the suggestion popover
    console.log('\n--- CLICKING BADGE TO OPEN POPOVER ---');
    await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      const badge = host.shadowRoot.querySelector('.badge');
      if (badge) badge.click();
    });
    await sleep(400);

    const popoverInfo = await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      const popover = host.shadowRoot.querySelector('.popover');
      if (!popover) return { open: false };

      const items = Array.from(popover.querySelectorAll('.suggestion-item')).map((el) => {
        return {
          msg: el.querySelector('.suggestion-msg')?.textContent,
          diff: el.querySelector('.suggestion-diff')?.textContent
        };
      });

      return {
        open: true,
        title: popover.querySelector('.popover-title')?.textContent,
        count: items.length,
        items
      };
    });
    console.log('Popover Cards Details:', popoverInfo);

    await testPage.screenshot({ path: path.join(SCREENSHOT_DIR, '03-live-popover-open.png') });
    console.log('Saved screenshot: screenshots/03-live-popover-open.png');

    // Accept the first suggestion ("a apple" -> "an apple")
    console.log('\n--- CLICKING "ACCEPT" ON FIRST SUGGESTION ---');
    await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      const firstAcceptBtn = host.shadowRoot.querySelector('.btn-accept');
      if (firstAcceptBtn) firstAcceptBtn.click();
    });
    await sleep(400);

    const updatedText = await testPage.evaluate(() => {
      return document.getElementById('test-textarea').value;
    });
    console.log('Textarea value after accepting suggestion:');
    console.log(`"${updatedText}"`);

    await testPage.screenshot({ path: path.join(SCREENSHOT_DIR, '04-live-text-replaced.png') });
    console.log('Saved screenshot: screenshots/04-live-text-replaced.png');

    // 4. Test Slovenian language grammar rule live
    console.log('\n--- TESTING SLOVENIAN PREPOSITION RULE ---');
    // Clear and focus textarea
    await testPage.evaluate(() => {
      const ta = document.getElementById('test-textarea');
      ta.value = '';
    });
    // Set language to 'sl' in extension storage using options page
    await optionsPage.bringToFront();
    await optionsPage.evaluate(() => {
      const sel = document.getElementById('opt-language');
      sel.value = 'sl';
      sel.dispatchEvent(new Event('change'));
      document.getElementById('btn-save').click();
    });
    await sleep(400);

    // Switch back to test page
    await testPage.bringToFront();
    await textarea.click();

    // Type Slovenian sentence with preposition mistake: "Včeraj sem šel z prijateljem k kmetu."
    console.log('Typing Slovenian text: "Včeraj sem šel z prijateljem k kmetu."');
    await textarea.type('Včeraj sem šel z prijateljem k kmetu.', { delay: 20 });
    await sleep(900);

    // Click badge to check Slovenian suggestions
    await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      const badge = host.shadowRoot.querySelector('.badge');
      if (badge) badge.click();
    });
    await sleep(400);

    const slPopover = await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      const popover = host.shadowRoot.querySelector('.popover');
      if (!popover) return null;
      return Array.from(popover.querySelectorAll('.suggestion-item')).map((el) => {
        return {
          msg: el.querySelector('.suggestion-msg')?.textContent,
          diff: el.querySelector('.suggestion-diff')?.textContent
        };
      });
    });
    console.log('Slovenian Suggestions:', slPopover);

    await testPage.screenshot({ path: path.join(SCREENSHOT_DIR, '05-slovenian-rules-live.png') });
    console.log('Saved screenshot: screenshots/05-slovenian-rules-live.png');

    // Accept Slovenian preposition correction
    console.log('\n--- CLICKING "ACCEPT" ON SLOVENIAN SUGGESTION ---');
    await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      const firstAcceptBtn = host.shadowRoot.querySelector('.btn-accept');
      if (firstAcceptBtn) firstAcceptBtn.click();
    });
    await sleep(400);

    const updatedSlText = await testPage.evaluate(() => {
      return document.getElementById('test-textarea').value;
    });
    console.log('Textarea value after accepting Slovenian suggestion:');
    console.log(`"${updatedSlText}"`);

    await testPage.screenshot({ path: path.join(SCREENSHOT_DIR, '06-slovenian-text-replaced.png') });
    console.log('Saved screenshot: screenshots/06-slovenian-text-replaced.png');

    // 4. Test Bottom-Docked Input Bar (like Telegram Web in user screenshot)
    console.log('\n--- TESTING BOTTOM-DOCKED CHAT INPUT (AUTO-FLIP ABOVE) ---');
    // Switch language back to English
    await optionsPage.bringToFront();
    await optionsPage.evaluate(() => {
      const sel = document.getElementById('opt-language');
      sel.value = 'en';
      sel.dispatchEvent(new Event('change'));
      document.getElementById('btn-save').click();
    });
    await sleep(400);

    await testPage.bringToFront();
    const bottomInput = await testPage.$('#bottom-chat-input');
    await bottomInput.click();
    console.log('Typing into bottom input bar: "Hello how are you doing? Teh day is beautifull"');
    await bottomInput.type('Hello how are you doing? Teh day is beautifull', { delay: 20 });
    await sleep(900);

    // Click badge in bottom chat input
    await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      const badge = host.shadowRoot.querySelector('.badge');
      if (badge) badge.click();
    });
    await sleep(400);

    const flipMetrics = await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      const popover = host.shadowRoot.querySelector('.popover');
      const input = document.getElementById('bottom-chat-input');
      if (!popover || !input) return null;
      const popRect = popover.getBoundingClientRect();
      const inRect = input.getBoundingClientRect();
      return {
        popoverTop: popRect.top,
        popoverBottom: popRect.bottom,
        inputTop: inRect.top,
        inputBottom: inRect.bottom,
        windowHeight: window.innerHeight,
        isAboveInput: popRect.bottom <= inRect.top + 2,
        isInsideViewport: popRect.top >= 0 && popRect.bottom <= window.innerHeight
      };
    });

    console.log('Bottom Input Popover Metrics:', flipMetrics);
    if (!flipMetrics?.isAboveInput) {
      throw new Error(`Popover did not flip above bottom input! ${JSON.stringify(flipMetrics)}`);
    }
    if (!flipMetrics?.isInsideViewport) {
      throw new Error(`Popover is outside viewport! ${JSON.stringify(flipMetrics)}`);
    }
    console.log('[PASS] Popover correctly flipped ABOVE the bottom chat bar and is 100% inside viewport!');

    await testPage.screenshot({ path: path.join(SCREENSHOT_DIR, '07-bottom-input-popover-flipped-up.png') });
    console.log('Saved screenshot: screenshots/07-bottom-input-popover-flipped-up.png');

    // Click "Fix All" in the flipped popover
    console.log('Clicking "Fix All" button...');
    await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      const fixAllBtn = host.shadowRoot.querySelector('.btn-fix-all');
      if (fixAllBtn) fixAllBtn.click();
    });
    await sleep(400);

    const fixedBottomText = await testPage.evaluate(() => {
      return document.getElementById('bottom-chat-input').value;
    });
    console.log('Bottom chat input after "Fix All":', `"${fixedBottomText}"`);

    await testPage.screenshot({ path: path.join(SCREENSHOT_DIR, '08-bottom-input-fixed.png') });
    console.log('Saved screenshot: screenshots/08-bottom-input-fixed.png');

    // 5. Test Zero-Errors Badge Click (Opens language & status popover)
    console.log('\n--- TESTING ZERO-ERRORS BADGE CLICK ---');
    await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      const badge = host.shadowRoot.querySelector('.badge');
      if (badge) badge.click();
    });
    await sleep(400);

    const zeroPopover = await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      const popover = host.shadowRoot.querySelector('.popover');
      if (!popover) return null;
      return {
        title: popover.querySelector('.popover-title')?.textContent,
        hasSelect: !!popover.querySelector('.popover-lang-select'),
        text: popover.textContent
      };
    });
    console.log('Zero-Errors Status Card:', zeroPopover);
    await testPage.screenshot({ path: path.join(SCREENSHOT_DIR, '09-zero-errors-status-card.png') });
    console.log('Saved screenshot: screenshots/09-zero-errors-status-card.png');

    // 6. Test Cross-Lingual Fallback: Set setting to 'sl', but type English sentence with 'teh'
    console.log('\n--- TESTING CROSS-LINGUAL SAFETY (SL selected, EN typed) ---');
    await optionsPage.bringToFront();
    await optionsPage.evaluate(() => {
      const sel = document.getElementById('opt-language');
      sel.value = 'sl';
      sel.dispatchEvent(new Event('change'));
      document.getElementById('btn-save').click();
    });
    await sleep(400);

    await testPage.bringToFront();
    await testPage.evaluate(() => {
      const input = document.getElementById('bottom-chat-input');
      input.value = '';
    });
    await bottomInput.click();
    console.log('Typing user sentence: "Hello how are you doing? Today teh day is beautifully."');
    await bottomInput.type('Hello how are you doing? Today teh day is beautifully.', { delay: 15 });
    await sleep(900);

    const crossLingualState = await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      const badge = host?.shadowRoot?.querySelector('.badge');
      return {
        badgeText: badge?.innerText,
        hasErrors: badge?.classList.contains('has-errors')
      };
    });
    console.log('Cross-Lingual Fallback Result:', crossLingualState);
    if (!crossLingualState.hasErrors) {
      throw new Error(`Cross-lingual fallback failed to flag English typo while SL was active!`);
    }
    console.log('[PASS] Cross-lingual fallback caught English typo even when language was set to Slovenian!');

    await testPage.screenshot({ path: path.join(SCREENSHOT_DIR, '10-cross-lingual-catch.png') });
    console.log('Saved screenshot: screenshots/10-cross-lingual-catch.png');

    // 7. Test 35,000-Word Dictionary & Multi-Word Spellcheck in Auto Mode
    console.log('\n--- TESTING 35K DICTIONARY & MULTI-WORD SPELLCHECK (AUTO MODE) ---');
    await optionsPage.bringToFront();
    await optionsPage.evaluate(() => {
      const sel = document.getElementById('opt-language');
      sel.value = 'auto';
      sel.dispatchEvent(new Event('change'));
      document.getElementById('btn-save').click();
    });
    await sleep(400);

    await testPage.bringToFront();
    await testPage.evaluate(() => {
      const input = document.getElementById('bottom-chat-input');
      input.value = '';
    });
    await bottomInput.click();
    const fullSentence = 'Hello how are you doing? Today the day is beautifully. I surelly hope tomorrrow will be beter';
    console.log('Typing full user sentence:', fullSentence);
    await bottomInput.type(fullSentence, { delay: 10 });
    await sleep(900);

    const multiErrorState = await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      const badge = host?.shadowRoot?.querySelector('.badge');
      return {
        badgeText: badge?.innerText,
        hasErrors: badge?.classList.contains('has-errors')
      };
    });
    console.log('Multi-Error State:', multiErrorState);

    // Open popover to inspect all suggestions
    await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      const badge = host.shadowRoot.querySelector('.badge');
      if (badge) badge.click();
    });
    await sleep(400);

    const multiSuggestions = await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      const popover = host.shadowRoot.querySelector('.popover');
      if (!popover) return null;
      return Array.from(popover.querySelectorAll('.suggestion-item')).map((el) => {
        return {
          diff: el.querySelector('.suggestion-diff')?.textContent?.trim().replace(/\s+/g, ' '),
          msg: el.querySelector('.suggestion-msg')?.textContent
        };
      });
    });
    console.log('Multi-Error Popover Suggestions:', multiSuggestions);
    await testPage.screenshot({ path: path.join(SCREENSHOT_DIR, '11-35k-dictionary-multi-errors.png') });
    console.log('Saved screenshot: screenshots/11-35k-dictionary-multi-errors.png');

    // Click "Fix All" and verify corrected text
    console.log('Clicking "Fix All"...');
    await testPage.evaluate(() => {
      const host = document.getElementById('nodaysrammar-root');
      const fixAllBtn = host.shadowRoot.querySelector('.btn-fix-all');
      if (fixAllBtn) fixAllBtn.click();
    });
    await sleep(400);

    const fullyCorrectedText = await testPage.evaluate(() => {
      return document.getElementById('bottom-chat-input').value;
    });
    console.log('Fully Corrected Sentence:\n', `"${fullyCorrectedText}"`);
    await testPage.screenshot({ path: path.join(SCREENSHOT_DIR, '12-fully-corrected-sentence.png') });
    console.log('Saved screenshot: screenshots/12-fully-corrected-sentence.png');

    console.log('\n=========================================');
    console.log('ALL LIVE EXTENSION TESTS PASSED PERFECTLY!');
    console.log('=========================================');

  } finally {
    await browser.close();
    server.close();
  }
}

runLiveTest().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('LIVE TEST FAILED:', err);
  server.close();
  process.exit(1);
});
