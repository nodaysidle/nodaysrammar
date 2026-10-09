# nodaysrammar — Agent Specification & Engineering Contract

> **NODAYSIDLE nodaysrammar** is an on-device, zero-telemetry multilingual grammar and spell checking browser extension for Chromium-based browsers (Manifest V3), powered by a small JS classifier over fixed label tables, offline frequency dictionaries, and grammar rules.

---

## 1. Non-Negotiable Architectural Principles

1. **100% On-Device / Zero Telemetry**:
   - No remote API calls, no analytics, no external network requests.
   - All text inspection and classification execute inside the local browser process.
   - Keystrokes never leave client memory.

2. **Isolated Shadow DOM Overlays**:
   - The user-facing UI (floating count badge, squiggly underline markers, suggestion popover card) MUST be injected inside a closed/isolated Shadow DOM (`#nodaysrammar-root`).
   - Page styles and host stylesheets must never corrupt the extension UI, and extension styles must never bleed into host pages.

3. **Non-Destructive Text Replacement**:
   - Input and textarea replacements must preserve caret position, undo history (`document.execCommand('insertText')`), and dispatch synthetic `input` and `change` events for framework compatibility (React, Vue, Angular).
   - Contenteditable nodes use targeted DOM Range replacements without wiping entire sibling nodes.

4. **Manifest V3 Compatibility**:
   - Background runs as an ES module service worker (`background/service-worker.js`).
   - Inference is plain JavaScript over `models/vocab-*.json` (no WASM / ONNX runtime).
   - No remote code evaluation (`unsafe-eval` is not permitted in MV3).

---

## 2. Directory Layout & Module Responsibilities

```
nodaysrammar/
├── manifest.json              # Chrome Manifest V3 manifest specification
├── background/
│   ├── service-worker.js      # Background service worker & IPC message router
│   ├── model-loader.js        # Loads vocab-*.json label tables & JS forward pass
│   ├── inference-engine.js    # Classifier + dictionaries + grammar rules
│   ├── spell-corrector.js     # ~35,000-word offline dictionary & Levenshtein generator
│   └── language-detector.js   # Fast n-gram on-device language detector (EN / IT / SL)
├── content/
│   ├── content-script.js      # Field observer, debounce (350ms), blocklist gate, overlay
│   ├── field-detector.js      # Standalone field detector (textarea, input, contenteditable)
│   ├── overlay-manager.js     # Shadow DOM manager: badges, highlights, auto-flip popovers
│   └── content.css            # Scoped root container styles
├── popup/                     # Browser action toolbar popup (status, toggle, language)
├── options/                   # Settings page (blocklist, model status)
├── onboarding/                # First-run welcome page & interactive test sandbox
├── models/                    # vocab-*.json label tables & dict-*.json dictionaries
├── scripts/                   # Label-table generation & icon scripts
└── tests/                     # Live Puppeteer tests + unit regressions
```

---

## 3. Background IPC Message Contract

All content-script to background communication flows via `chrome.runtime.sendMessage`:

| Action | Payload | Response |
| --- | --- | --- |
| `CHECK_GRAMMAR` | `{ text: string, url?: string }` | `{ success, language, suggestions, ... }` |
| `GET_STATUS` | `{}` | `{ enabled, selectedLanguage, modelStatus, ... }` |
| `RELOAD_MODELS` / `WARM_MODEL` / `WARM_ALL_MODELS` | optional language | status object |
| `DETECT_LANGUAGE` | `{ text, fallback? }` | `{ language, confidence }` |

---

## 4. Grammar & Spell Checking Pipeline

1. **Language Identification**:
   - `language-detector.js` inspects n-gram letter distributions to detect `en`, `it`, or `sl`.
2. **Offline Dictionary Verification**:
   - `spell-corrector.js` checks tokens against ~35,000-word frequency dictionaries.
   - Out-of-vocabulary words generate Levenshtein candidates ranked by edit distance, length similarity, and frequency. Apostrophe contractions are treated as known-good.
3. **JS Token Classification**:
   - Token embeddings/weights from `models/vocab-{lang}.json` (fixed label tables; seed 42; not trained).
   - Combined with regex grammar rules (a/an, agreement, their/there, its/it's, etc.).
4. **Interactive Correction Flow**:
   - Content script receives error coordinates `[start, end]`.
   - Blocklisted hosts never attach listeners.
   - Badge / popover / Fix All; popover close restores field focus and caret.

---

## 5. Build & Test Commands

```bash
# Unit / REEL regressions (no browser)
npm run test:regressions

# Live integration test suite via Puppeteer
NODAYSRAMMAR_BROWSER=/usr/bin/google-chrome-stable node tests/test-live.js

# Auto-Fix and "Fix All" workflows
npm run test:autofix

# Regenerate vocab-*.json label tables
python3 scripts/generate_real_models.py
```
