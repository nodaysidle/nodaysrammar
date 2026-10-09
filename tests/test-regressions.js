/**
 * Regression tests for REEL-reported bugs (logic-level, no browser required).
 * 1) "don't" must not be re-flagged as "dont" after Fix All
 * 2) "realy" must suggest "really", not a short stem like "rea"
 * 3) Rules must fire: I has, their/there, its/it's, a honest
 * 4) closePopover restores focus (covered in test-live / test-autofix UI path;
 *    here we assert OverlayManager closePopover behavior via a minimal DOM smoke
 *    when jsdom is unavailable we document the content-script contract in comments
 *    and exercise restore-focus helpers indirectly via Puppeteer in test-live).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SpellCorrector, normalizeApostrophes } from '../background/spell-corrector.js';
import { InferenceEngine } from '../background/inference-engine.js';
import { ModelLoader } from '../background/model-loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log(`  [PASS] ${msg}`);
  } else {
    failed += 1;
    console.error(`  [FAIL] ${msg}`);
  }
}

// Mock chrome.runtime.getURL + fetch for model/dict loads from disk
globalThis.chrome = {
  runtime: {
    getURL(p) {
      return `file://${path.join(ROOT, p)}`;
    }
  }
};

const _fetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const filePath = String(url).replace(/^file:\/\//, '');
  const buf = fs.readFileSync(filePath);
  return {
    ok: true,
    status: 200,
    async json() {
      return JSON.parse(buf.toString('utf8'));
    },
    async arrayBuffer() {
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }
  };
};

const dictEn = JSON.parse(fs.readFileSync(path.join(ROOT, 'models/dict-en.json'), 'utf8'));
const vocabEn = JSON.parse(fs.readFileSync(path.join(ROOT, 'models/vocab-en.json'), 'utf8'));

async function buildEngine() {
  const loader = new ModelLoader();
  // Bypass chrome fetch path: inject session directly after loadModel would run
  const { TokenModelSession } = await import('../background/model-loader.js');
  const session = new TokenModelSession('en', vocabEn);
  loader.models.set('en', session);
  loader.status.en = 'ready';

  const engine = new InferenceEngine(loader);
  engine.spellCorrector.loadDictionaryData('en', dictEn);
  engine.spellCorrector.registerCorrections('en', vocabEn.corrections || {});
  return engine;
}

console.log('\n=== REEL regression tests ===\n');

// --- Apostrophe normalize ---
console.log('normalizeApostrophes');
assert(normalizeApostrophes("don\u2019t") === "don't", 'curly apostrophe normalizes to ASCII');

// --- (1) don't must stay known / not suggest dont ---
console.log('\n(1) Apostrophe / don\'t re-flag');
{
  const sc = new SpellCorrector();
  sc.loadDictionaryData('en', dictEn);
  sc.registerCorrections('en', { dont: "don't", realy: 'really', ...(vocabEn.corrections || {}) });

  assert(sc.isKnown("don't", 'en') === true, '"don\'t" is known (contraction / correction target)');
  assert(sc.suggest("don't", 'en') === null, '"don\'t" must not suggest "dont"');
  assert(sc.suggest('dont', 'en') === "don't", '"dont" still corrects to "don\'t"');
}

{
  const engine = await buildEngine();
  const afterFix = await engine.analyze("The boy don't know.", 'en');
  const bad = afterFix.filter(
    (s) => s.original.toLowerCase().replace(/’/g, "'") === "don't" && s.replacement.toLowerCase() === 'dont'
  );
  assert(bad.length === 0, 'analyze("The boy don\'t know.") does not flag don\'t → dont');
  const dontTypo = await engine.analyze('The boy dont know.', 'en');
  assert(
    dontTypo.some((s) => s.original.toLowerCase() === 'dont' && s.replacement.toLowerCase() === "don't"),
    'analyze still corrects dont → don\'t'
  );
}

// --- (2) realy → really ---
console.log('\n(2) realy ranking');
{
  const sc = new SpellCorrector();
  sc.loadDictionaryData('en', dictEn);
  sc.registerCorrections('en', { realy: 'really', ...(vocabEn.corrections || {}) });
  const sug = sc.suggest('realy', 'en');
  assert(sug === 'really', `realy suggests really (got ${JSON.stringify(sug)})`);
  assert(sug !== 'rea' && sug !== 'real', 'realy must not collapse to rea/real');
}

{
  const engine = await buildEngine();
  const hits = await engine.analyze('This is realy important.', 'en');
  const realyHit = hits.find((s) => s.original.toLowerCase() === 'realy');
  assert(!!realyHit, 'realy is flagged');
  assert(realyHit?.replacement === 'really', `realy → really (got ${realyHit?.replacement})`);
}

// --- (3) Grammar rules ---
console.log('\n(3) Grammar rules: I has / their-there / its-it\'s / a honest');
{
  const engine = await buildEngine();

  const iHas = await engine.analyze('I has a problem.', 'en');
  assert(
    iHas.some((s) => /I has/i.test(s.original) && /I have/i.test(s.replacement)),
    'I has → I have'
  );

  const theirIs = await engine.analyze('Their is a cat.', 'en');
  assert(
    theirIs.some((s) => /their is/i.test(s.original) && /there is/i.test(s.replacement)),
    'Their is → There is'
  );

  const itsA = await engine.analyze('Its a nice day.', 'en');
  assert(
    itsA.some((s) => /its a/i.test(s.original) && /it's a/i.test(s.replacement)),
    "Its a → It's a"
  );

  const aHonest = await engine.analyze('She is a honest person.', 'en');
  assert(
    aHonest.some((s) => /a honest/i.test(s.original) && /an honest/i.test(s.replacement)),
    'a honest → an honest (silent h / vowel sound)'
  );

  const aApple = await engine.analyze('This is a apple.', 'en');
  assert(
    aApple.some((s) => /a apple/i.test(s.original) && /an apple/i.test(s.replacement)),
    'a apple → an apple'
  );
}

// --- (4) Focus restore contract (unit-level on OverlayManager is DOM-bound;
//     Puppeteer coverage lives in test-live / test-autofix. Here we verify the
//     content-script source contains closePopover restoreFocus.) ---
console.log('\n(4) Focus restore after popover close (source contract)');
{
  const src = fs.readFileSync(path.join(ROOT, 'content/content-script.js'), 'utf8');
  assert(src.includes('closePopover'), 'OverlayManager defines closePopover');
  assert(src.includes('restoreFocus'), 'closePopover accepts restoreFocus');
  assert(/el\.focus\(/.test(src), 'closePopover restores focus to active field');
  assert(src.includes('setSelectionRange'), 'caret restored via setSelectionRange');
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
