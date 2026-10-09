# NODAYSIDLE nodaysrammar — User & Technical Guide

Welcome to **NODAYSIDLE nodaysrammar**, an on-device, privacy-preserving multilingual grammar and spelling assistant for Chromium browsers (Chrome Manifest V3). Checking uses a small JS classifier, ~35,000-word offline dictionaries, and grammar rules — not a cloud model and not an ONNX/WASM runtime.

---

## Table of Contents
1. [Core Philosophy & Privacy](#1-core-philosophy--privacy)
2. [Step-by-Step Installation](#2-step-by-step-installation)
3. [How the Extension Works](#3-how-the-extension-works)
4. [Supported Languages & Grammar Rules](#4-supported-languages--grammar-rules)
5. [User Interface Walkthrough](#5-user-interface-walkthrough)
6. [On-Device Classifier & Dictionaries](#6-on-device-classifier--dictionaries)
7. [Troubleshooting & FAQ](#7-troubleshooting--faq)

---

## 1. Core Philosophy & Privacy

Traditional writing assistants transmit keystrokes and drafts to third-party servers.

**NODAYSIDLE nodaysrammar** works differently:

- **100% local processing**: language detection, dictionary lookup, JS classification, and grammar rules all run inside your browser.
- **Nothing is sent to nodaysidle or any grammar API**. Disconnect the network and checking still works.
- **Settings sync**: preferences — including the site blocklist, language, enable toggle, and auto-fix — are stored in `chrome.storage.sync` and sync through **Chrome Sync** when you are signed into Chrome. That sync is browser infrastructure, not an nodaysidle backend.
- **Minimal permissions**: only `storage`. Content scripts are registered for `<all_urls>` so normal websites can be checked; the blocklist disables listeners on matching hosts.

```
┌────────────────────────────────────────────────────────┐
│                      YOUR BROWSER                      │
│  [ Web Page Input ] ──(Debounce 350ms)──┐              │
│                                         ▼              │
│  [ Shadow DOM Overlay ] ◄── [ Content Script ]         │
│          ▲                              │              │
│          │                              ▼ (IPC)        │
│          │                   [ Background Worker ]     │
│          │                              │              │
│          │                              ▼              │
│  [ Visual Corrections ] ◄── [ JS classifier + dicts ]  │
│                              (models/vocab-*.json)     │
└────────────────────────────────────────────────────────┘
          ❌ NO TEXT IS SENT TO REMOTE SERVERS
```

---

## 2. Step-by-Step Installation

### Prerequisites
- Any Chromium-based browser: **Google Chrome**, **Microsoft Edge**, **Brave**, **Arc**, or **Vivaldi**.
- This extension is **not** on the Chrome Web Store.

### From a Release zip
1. Download `NODAYSIDLE-nodaysrammar-<version>-chrome.zip` (and `.sha256`) from [Releases](https://github.com/nodaysidle/nodaysrammar/releases).
2. Verify: `shasum -a 256 -c NODAYSIDLE-nodaysrammar-<version>-chrome.zip.sha256`
3. Unzip the archive.
4. Open `chrome://extensions/` (or `edge://extensions/`), enable **Developer mode**, click **Load unpacked**, and select **the unzipped nodaysrammar folder (or your clone)**.

### From source
1. Clone the repository.
2. Load unpacked and choose **the unzipped nodaysrammar folder (or your clone)**.
3. The welcome / onboarding page opens on first install.

---

## 3. How the Extension Works

### 3.1 Editable Field Detection
The content script monitors:
- `<input type="text|search|email|url">`
- `<textarea>`
- `[contenteditable]`

Password, hidden, and non-text inputs are ignored. If the current hostname matches the blocklist, **no listeners are attached** (and listeners detach when the blocklist changes).

### 3.2 Shadow DOM Overlays
UI lives under `#nodaysrammar-root` with an isolated shadow root so host CSS cannot restyle badges/popovers and extension CSS cannot bleed into the page. Closing the suggestion card restores focus and caret to the active field.

### 3.3 State-Preserving Text Replacement
Inputs use `setRangeText` + synthetic `input`/`change`. Contenteditable uses `execCommand('insertText')` when possible so Undo still works.

### 3.4 On-Device Pipeline
After ~350 ms idle:
1. Language detection (or your forced language).
2. Tokenize with apostrophe-aware spans.
3. JS forward pass over `vocab-*.json` label tables + correction maps.
4. Dictionary / Levenshtein suggestions for unknown tokens.
5. Language-specific regex grammar rules.
6. Structured suggestions returned to the overlay.

---

## 4. Supported Languages & Grammar Rules

### English (`en`)
Implemented rules (exact):

| Rule | Example |
| --- | --- |
| Indefinite article by **vowel sound** (`a`/`an`), including silent-h (*honest*, *hour*, *honor*, *heir*, *herb*) | `a apple` → `an apple`; `a honest` → `an honest` |
| Linking verb + adverb → predicate adjective | `is beautifully` → `is beautiful` |
| their / there (before copulas / clear possessives) | `their is` → `there is`; `there own` → `their own` |
| its / it's | `its a` → `it's a`; `it's own` → `its own` |
| could / should / would of | `should of` → `should have` |
| he don't / they doesn't | `he don't` → `he doesn't` |
| I/you/we/they has | `I has` → `I have` |
| Repeated words | `will will` → `will` |

Plus spelling via label-table corrections and the ~35k dictionary (`teh` → `the`, `realy` → `really`, `dont` → `don't`, …). Contractions forms like `don't` are not re-flagged back to `dont`.

### Italian (`it`)
Accents (`perche` → `perché`, `e stato` → `è stato`), `qual'è` → `qual è`, feminine/masculine elision, `d'accordo`.

### Slovenian (`sl`)
Prepositions `s`/`z` and `k`/`h`, commas before `ki`/`ko`/`ker`/`da`/`če`, dictionary orthography.

---

## 5. User Interface Walkthrough

### Toolbar Popup
Master toggle, engine status, language selector, auto-fix on Spacebar, Settings, Reload Engine.

### Onboarding & Live Playground
Explains local privacy, language picker, and an interactive textarea sandbox.

### Settings & Site Management
- Default language
- **Blocklist**: on listed domains, listeners and overlays are fully disabled; changes apply immediately via `chrome.storage.onChanged`
- Classifier load status per language
- Purge/reload and reset defaults

### Inline Badge & Suggestion Cards
Badge shows error count; popover lists diffs with Accept / Ignore / Fix All. After the card closes, focus returns to the field so typing continues normally.

---

## 6. On-Device Classifier & Dictionaries

There is **no training pipeline** in the shipped product.

- `models/vocab-*.json`: fixed per-token label tables and weights produced by `scripts/generate_real_models.py` with **numpy seed 42** and forced labels — **not trained**.
- `models/dict-*.json`: frequency dictionaries for ranking spelling candidates.
- Runtime math (JS): `Gather → Linear(32→64)+ReLU → Linear(64→5) → argmax` over classes `OK | SPELL | GRAMMAR | PREP | PUNCT`.

Regenerate label tables:

```bash
python3 scripts/generate_real_models.py
```

Then reload the extension on `chrome://extensions`.

---

## 7. Troubleshooting & FAQ

### Q: Models show UNINITIALIZED?
Click **Purge Cache & Reload Models** in Settings, or Reload the extension card.

### Q: Google Docs?
Docs uses canvas rendering; standard inputs, textareas, Gmail, Notion, GitHub, Slack web, and contenteditable fields are supported.

### Q: chrome:// pages or the Web Store?
Chrome blocks content scripts on those origins.

### Q: Disable on one site?
Add the domain under **Per-Site Permissions & Blocklist** and save. Listeners detach on that host.

---

*NODAYSIDLE nodaysrammar — Manifest V3, on-device JS classifier, dictionaries, and grammar rules.*
