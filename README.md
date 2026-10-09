<p align="center">
  <img src="assets/icons/icon-128.png" width="128" height="128" alt="nodaysrammar icon">
</p>

<h1 align="center">nodaysrammar</h1>

<p align="center">
  <strong>On-device, zero-telemetry multilingual grammar and spell checker for Chromium.</strong><br>
  Local neural syntax classification via ONNX Runtime Web WASM and 35,000-word offline frequency dictionaries. Your keystrokes never leave your browser.
</p>

<p align="center">
  <img alt="Chrome MV3" src="https://img.shields.io/badge/Chrome-MV3-4285F4?style=flat-square&logo=google-chrome&logoColor=white">
  <img alt="ONNX Runtime Web" src="https://img.shields.io/badge/ONNX%20Runtime-Web%20WASM-005CED?style=flat-square&logo=onnx&logoColor=white">
  <img alt="Languages" src="https://img.shields.io/badge/Languages-EN%20%7C%20IT%20%7C%20SL-blueviolet?style=flat-square">
  <img alt="Privacy" src="https://img.shields.io/badge/Privacy-100%25%20On--Device-success?style=flat-square">
  <img alt="Telemetry" src="https://img.shields.io/badge/Telemetry-None-4c8c6b?style=flat-square">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-green?style=flat-square">
</p>

<p align="center">
  <a href="https://github.com/nodaysidle/nodaysrammar/releases"><strong>Releases</strong></a>
  ·
  <a href="USERGUIDE.md"><strong>User Guide</strong></a>
  ·
  <a href="codemap.md"><strong>Architecture Map</strong></a>
  ·
  <a href="#quick-start"><strong>Quick Start</strong></a>
</p>

---

> **The Problem:** Cloud-based writing assistants (Grammarly, LanguageTool Cloud, remote AI extensions) transmit private keystrokes, personal notes, and credentials to third-party servers, creating security risks, latency overhead, and tracking vectors.
>
> **The Result:** **nodaysrammar** runs 100% locally. Lightweight ONNX neural models and 35,000-word offline frequency dictionaries execute in the Chromium background service worker via WebAssembly. Keystrokes never touch the network. Highlighting and suggestion cards render inside an isolated, non-colliding Shadow DOM overlay.

---

## ⚡ Architecture Flow

```mermaid
flowchart TD
    A["Active Editable Field (input / textarea / contenteditable)"] -->|User types / Debounce 350ms| B["Content Script (Observer)"]
    
    B -->|chrome.runtime.sendMessage| C["Background Service Worker"]
    
    subgraph Local_Pipeline ["100% On-Device Neural & Syntactic Engine"]
        C --> D["Language Detector (~0.5ms n-gram classification)"]
        D -->|EN / IT / SL| E["35,000-Word Offline Frequency Dictionary"]
        E -->|Spelling & Levenshtein Candidates| F["ONNX Runtime Web (WASM Engine)"]
        F -->|Token Classification & Syntax Rules| G["Error Coordinates & Replacements"]
    end
    
    G -->|IPC Response| H["Shadow DOM Manager (#nodaysrammar-root)"]
    
    subgraph Isolated_Overlay ["Zero CSS Bleed & Native UX"]
        H --> H1["Floating Error Count Badge"]
        H --> H2["Squiggly Underline Highlights"]
        H --> H3["Auto-Flipping Viewport Popover Card"]
    end
    
    H3 -->|Click Suggestion / 'Fix All' / Spacebar| I["Caret-Preserving DOM Replacement"]
```

---

## ✨ Features

- **Zero Telemetry & 100% Private**: No analytics, no logging, no external API endpoints. Disconnect from Wi-Fi and the extension continues functioning at full speed.
- **Multilingual Support**:
  - 🇬🇧 **English (`en`)**: Subject-verb agreement, indefinite article selection (`a` vs `an`), homophone disambiguation (`there`/`their`/`they're`, `its`/`it's`), double negatives.
  - 🇮🇹 **Italian (`it`)**: Mandatory accents (`perché`, `è`), apostrophe and elision handling (`un'` vs `un`, `qual è`), contraction grammar.
  - 🇸🇮 **Slovenian (`sl`)**: Preposition phonetics (`s` before unvoiced consonants vs `z`; `k` vs `h`), subordinate conjunction commas (`ki`, `ko`, `ker`, `da`, `če`), diacritics.
- **Isolated Shadow DOM**: Injected via closed Shadow DOM to guarantee that page styles never break extension badges or suggestion cards, and extension styles never bleed into the host page.
- **Viewport-Aware Popover**: Suggestion cards auto-flip position between bottom and top based on element proximity to viewport boundaries.
- **Safe Text Replacement**: Dispatches synthetic `input` and `change` events with `execCommand('insertText')` to retain native browser undo history (`Ctrl+Z`).
- **Ergonomic Workflows**:
  - Click any underline to inspect suggestions.
  - Click floating badge to view all errors.
  - Click **"Fix All"** to apply all suggestions instantly.
  - Optional **"Auto-Fix on Spacebar"** mode.

---

## 📸 Interface Preview

| Feature | Screenshot |
| --- | --- |
| **Interactive Underlines & Errors** | ![English Errors](screenshots/02-english-errors.png) |
| **Auto-Flip Suggestion Card** | ![Card Inspection](screenshots/06-underline-inspection.png) |
| **Instant Correction Applied** | ![Error Fixed](screenshots/09-error-fixed.png) |
| **All Fixed State** | ![All Fixed](screenshots/10-all-fixed.png) |
| **Options & Settings Page** | ![Options Page](screenshots/11-options-page.png) |
| **Interactive Onboarding Tour** | ![Onboarding](screenshots/12-onboarding-page.png) |

---

## 🚀 Quick Start

### 1. Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/nodaysidle/nodaysrammar.git
   cd nodaysrammar
   ```
2. Open your Chromium-based browser (Chrome, Brave, Edge, Arc, Chromium).
3. Navigate to `chrome://extensions`.
4. Turn on **Developer mode** (toggle in upper right corner).
5. Click **Load unpacked** and select the `nodaysrammar` folder.
6. The extension is now active on all websites!

### 2. Testing Live

Run the comprehensive automated Puppeteer test suite against Brave / Chromium:

```bash
npm install
npm test
```

To test spacebar auto-fix and "Fix All" workflows:

```bash
npm run test:autofix
```

---

## 🧠 Neural Models & Offline Weights

nodaysrammar bundles lightweight ONNX neural models trained with opset 17 alongside 35,000-word offline frequency dictionaries:

| Model | File | Format | Target Rules |
| --- | --- | --- | --- |
| **English** | `models/en-grammar.onnx` | ONNX opset 17 (31 KB) | Agreement, articles, homophones, orthography |
| **Italian** | `models/it-grammar.onnx` | ONNX opset 17 (25 KB) | Mandatory accents, elision, contractions |
| **Slovenian** | `models/sl-grammar.onnx` | ONNX opset 17 (24 KB) | Preposition phonetics (s/z, k/h), conjunction commas |
| **Dictionaries** | `models/dict-*.json` | JSON (~570 KB each) | 35k-word frequency lists + Levenshtein ranking |

To regenerate or retrain models from scratch:

```bash
python3 scripts/generate_real_models.py
```

---

## 📁 Repository Reference

- [`USERGUIDE.md`](USERGUIDE.md) — Comprehensive user, technical, and troubleshooting documentation
- [`codemap.md`](codemap.md) — Complete codebase index and architectural structure
- [`AGENTS.md`](AGENTS.md) — System invariants, IPC contracts, and agent guidelines
- [`docs/RELEASE-NOTES-v1.0.0.md`](docs/RELEASE-NOTES-v1.0.0.md) — Release notes and checksums

---

## 📄 License

[MIT License](LICENSE) © 2026 [nodaysidle](https://github.com/nodaysidle)
