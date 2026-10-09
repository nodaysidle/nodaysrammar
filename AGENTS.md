# nodaysrammar — Agent Specification & Engineering Contract

> **nodaysrammar** is an on-device, zero-telemetry multilingual grammar and spell checking browser extension for Chromium-based browsers (Manifest V3), powered by local ONNX neural models (WebAssembly) and offline frequency dictionaries.

---

## 1. Non-Negotiable Architectural Principles

1. **100% On-Device / Zero Telemetry**:
   - No remote API calls, no analytics, no external network requests.
   - All text inspection and neural inferences execute inside the local browser process.
   - Keystrokes never leave client memory.

2. **Isolated Shadow DOM Overlays**:
   - The user-facing UI (floating count badge, squiggly underline markers, suggestion popover card) MUST be injected inside a closed/isolated Shadow DOM (`#nodaysrammar-root`).
   - Page styles and host stylesheets must never corrupt the extension UI, and extension styles must never bleed into host pages.

3. **Non-Destructive Text Replacement**:
   - Input and textarea replacements must preserve caret position, undo history (`document.execCommand('insertText')`), and dispatch synthetic `input` and `change` events for framework compatibility (React, Vue, Angular).
   - Contenteditable nodes use targeted DOM Range replacements without wiping entire sibling nodes.

4. **Manifest V3 Compatibility**:
   - Background runs as an ES module service worker (`background/service-worker.js`).
   - WASM execution uses local bundled ONNX Runtime Web (`lib/ort.bundle.min.mjs`).
   - No remote code evaluation (`unsafe-eval` is not permitted in MV3).

---

## 2. Directory Layout & Module Responsibilities

```
nodaysrammar/
├── manifest.json              # Chrome Manifest V3 manifest specification
├── background/
│   ├── service-worker.js      # Background service worker & IPC message router
│   ├── model-loader.js        # ONNX model loader & WASM tensor execution engine
│   ├── inference-engine.js    # Multilingual neural & syntactic grammar analysis
│   ├── spell-corrector.js     # 35,000-word offline dictionary & Levenshtein generator
│   └── language-detector.js   # Fast n-gram on-device language detector (EN / IT / SL)
├── content/
│   ├── content-script.js      # Field observer, debounce (350ms), and overlay bridge
│   ├── field-detector.js      # Standalone field detector (textarea, input, contenteditable)
│   ├── overlay-manager.js     # Shadow DOM manager: badges, highlights, auto-flip popovers
│   └── content.css            # Scoped root container styles
├── popup/                     # Browser action toolbar popup (status, toggle, language)
├── options/                   # Settings page (whitelisted domains, model weights, custom rules)
├── onboarding/                # First-run welcome page & interactive test sandbox
├── models/                    # ONNX neural weights (*.onnx), vocabularies & dictionaries
├── lib/                       # Bundled ONNX Runtime Web (WASM-based inference)
├── scripts/                   # Model conversion & dictionary training scripts
└── tests/                     # Live headless/headed integration tests with Puppeteer
```

---

## 3. Background IPC Message Contract

All content-script to background communication flows via `chrome.runtime.sendMessage`:

| Action | Payload | Response |
| --- | --- | --- |
| `CHECK_TEXT` | `{ text: string, lang?: string, url?: string }` | `{ language: string, errors: GrammarError[], timestamp: number }` |
| `CORRECT_TEXT` | `{ text: string, error: GrammarError }` | `{ replacement: string }` |
| `AUTO_FIX_TEXT` | `{ text: string, lang?: string }` | `{ text: string, fixedCount: number, corrections: object[] }` |
| `GET_STATUS` | `{}` | `{ initialized: boolean, models: object, activeLanguage: string }` |
| `GET_CONFIG` | `{}` | `{ autoFixOnSpace: boolean, highlightColor: string, ... }` |

---

## 4. Grammar & Spell Checking Pipeline

1. **Language Identification**:
   - `language-detector.js` inspects n-gram letter distributions to detect `en` (English), `it` (Italian), or `sl` (Slovenian) in sub-1ms.
2. **Offline Dictionary Verification**:
   - `spell-corrector.js` checks each token against 35,000-word offline frequency dictionaries.
   - Out-of-vocabulary words generate top-ranked phonetic/Levenshtein candidates sorted by frequency weight.
3. **Neural Token Classification**:
   - Token embeddings are passed through `models/{lang}-grammar.onnx` (opset 17).
   - Identifies syntax errors, subject-verb agreement mismatches, article mistakes (`a` vs `an`), and missing diacritics/conjunction commas.
4. **Interactive Correction Flow**:
   - Content script receives error coordinates `[start, end]`.
   - Positions squiggly underline markers over text.
   - Positions floating count badge in bottom-right corner of the active field.
   - Clicking badge or underline renders an auto-flipping popover card with one-click replacements and "Fix All".

---

## 5. Build & Test Commands

```bash
# Run live integration test suite via Puppeteer & Brave Origin
node tests/test-live.js

# Test real-time Auto-Fix and "Fix All" workflows
node tests/test-autofix.js

# Regenerate offline ONNX models and frequency dictionaries
python3 scripts/generate_real_models.py
```
