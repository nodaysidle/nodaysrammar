# nodaysrammar — Comprehensive User & Technical Guide

Welcome to **nodaysrammar**, an on-device, privacy-preserving multilingual grammar and spelling assistant built natively for Chromium browsers using **Chrome Manifest V3** and **ONNX Runtime Web / WebAssembly**.

---

## Table of Contents
1. [Core Philosophy & Privacy Architecture](#1-core-philosophy--privacy-architecture)
2. [Step-by-Step Installation](#2-step-by-step-installation)
3. [How the Extension Works](#3-how-the-extension-works)
   - [3.1 Editable Field Detection](#31-editable-field-detection)
   - [3.2 Non-Destructive Shadow DOM Overlays](#32-non-destructive-shadow-dom-overlays)
   - [3.3 State-Preserving Text Replacement](#33-state-preserving-text-replacement)
   - [3.4 The On-Device Neural Pipeline](#34-the-on-device-neural-pipeline)
4. [Supported Languages & Grammar Rules](#4-supported-languages--grammar-rules)
   - [English (`en`)](#english-en)
   - [Italian (`it`)](#italian-it)
   - [Slovenian (`sl`)](#slovenian-sl)
5. [User Interface Walkthrough](#5-user-interface-walkthrough)
   - [Toolbar Popup UI](#toolbar-popup-ui)
   - [Onboarding & Live Playground](#onboarding--live-playground)
   - [Settings & Site Management](#settings--site-management)
   - [Inline Interactive Badge & Suggestion Cards](#inline-interactive-badge--suggestion-cards)
6. [Local ONNX Models & Training Pipeline](#6-local-onnx-models--training-pipeline)
7. [Troubleshooting & FAQ](#7-troubleshooting--faq)

---

## 1. Core Philosophy & Privacy Architecture

Traditional writing assistants (Grammarly, LanguageTool Cloud, ChatGPT extensions) transmit every keystroke, password field proximity, and draft email across the public internet to third-party servers.

**nodaysrammar** works on an entirely different principle:
- **100% Local Processing**: All text analysis, language identification, and neural network evaluations occur inside your local browser process.
- **Zero Remote Network Calls**: No telemetry, no cloud inference, and no external tracking. If you disconnect your internet connection, nodaysrammar continues to function identically.
- **Strict Manifest V3 Sandbox**: Uses only three standard browser permissions:
  - `storage`: Saves your language preference and site blocklist.
  - `activeTab`: Accesses the active input element when typing.
  - `scripting`: Coordinates the Shadow DOM highlight overlay.

```
┌────────────────────────────────────────────────────────┐
│                      YOUR BROWSER                      │
│                                                        │
│  [ Web Page Input ] ──(Debounce 350ms)──┐              │
│                                         ▼              │
│  [ Shadow DOM Overlay ] ◄── [ Content Script ]         │
│          ▲                              │              │
│          │                              ▼ (IPC)        │
│          │                   [ Background Worker ]     │
│          │                              │              │
│          │                              ▼              │
│  [ Visual Corrections ] ◄── [ ONNX Neural Engine ]     │
│                                (models/*.onnx)         │
└────────────────────────────────────────────────────────┘
          ❌ NO DATA EVER LEAVES YOUR COMPUTER
```

---

## 2. Step-by-Step Installation

### Prerequisites
- Any Chromium-based browser: **Google Chrome**, **Microsoft Edge**, **Brave**, **Arc**, or **Vivaldi**.

### Loading Unpacked into Chrome / Edge
1. Clone or download the repository to your computer.
2. Open your browser and navigate to:
   - Chrome / Brave: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. In the top-right corner, switch the **Developer mode** toggle to **ON**.
4. In the top-left corner, click the **Load unpacked** button.
5. In the file dialog, choose the extension directory:
   ```
   /home/arch/dev/nodaysidle/chrome-extension
   ```
6. The extension will appear in your extensions list, and the **Welcome to nodaysrammar** onboarding page will open automatically.

---

## 3. How the Extension Works

### 3.1 Editable Field Detection
The content script (`content/content-script.js`) monitors user interactions across all frames. It detects:
- Standard single-line inputs: `<input type="text">`, `type="search"`, `type="email"`, `type="url"`.
- Multi-line text boxes: `<textarea>`.
- Rich-text editors: Elements with `contenteditable="true"` or `isContentEditable` (such as Notion, Gmail, Slack web, GitHub comments, and Jira).

To avoid running CPU cycles on non-text elements, it ignores password fields, hidden inputs, numeric fields, and file upload pickers.

### 3.2 Non-Destructive Shadow DOM Overlays
Many browser extensions break webpage styling by injecting CSS directly into `document.head`, causing fonts, buttons, or layouts of host websites to break.

**nodaysrammar isolates its entire UI inside a closed Shadow DOM host:**
```html
<div id="nodaysrammar-root" style="all: initial; position: absolute; ...">
  #shadow-root (open)
    <style>/* Scoped internal styles */</style>
    <div class="badge has-errors">⚡ 2</div>
    <div class="popover">...</div>
</div>
```
Because styles inside `#shadow-root` cannot affect the outer document, nodaysrammar will never alter the design, colors, or responsiveness of websites you visit.

### 3.3 State-Preserving Text Replacement
Modern web applications built with **React**, **Vue**, **Angular**, or **Svelte** do not use simple DOM properties; they maintain internal Virtual DOM state trees. If an extension blindly mutates `element.value = "new text"`, the framework ignores the change or wipes it out on the next keystroke.

nodaysrammar uses native API updates followed by synthetic reactive event dispatches:
1. For `<textarea>` and `<input>`:
   ```javascript
   element.setRangeText(replacement, start, end, 'end');
   element.dispatchEvent(new Event('input', { bubbles: true }));
   element.dispatchEvent(new Event('change', { bubbles: true }));
   ```
2. For rich text `[contenteditable]`:
   - Maps character offsets to a precise DOM `Range` object.
   - Executes `document.execCommand('insertText', false, replacement)` to preserve the browser's native **Undo / Redo (`Ctrl+Z` / `Cmd+Z`) history**.
   - Dispatches an `InputEvent` with inputType `insertReplacementText`.

### 3.4 The On-Device Neural Pipeline
When you pause typing for **350 milliseconds**, the background service worker executes the model:
1. **Language Detection**:
   - If language is set to **Auto-detect**, the on-device n-gram analyzer checks vocabulary overlap and language-specific diacritics (`č, š, ž` for Slovenian; `à, è, é, ò, ù` for Italian).
2. **Tokenizer & Tensor Gathering**:
   - The input is split into words while preserving exact character offsets `[start, end]`.
   - Each word is converted to its integer token ID.
3. **Neural Forward Pass**:
   - Runs through the ONNX feedforward neural model:
     $$\text{Gather} \rightarrow \text{Linear}(32 \rightarrow 64) \rightarrow \text{ReLU} \rightarrow \text{Linear}(64 \rightarrow 5) \rightarrow \text{Logits}$$
   - Identifies if the token is `OK`, `SPELL`, `GRAMMAR`, `PREP`, or `PUNCT`.
4. **Contextual Syntax Rules**:
   - Checks grammar rules like article agreement, elision, phonetics, and comma placement.
5. **Response Delivery**:
   - Sends structured suggestions back to the content script overlay.

---

## 4. Supported Languages & Grammar Rules

### English (`en`)
- **Model**: `models/en-grammar.onnx`
- **Neural Token Spelling & Grammar**: Detects common spelling mistakes (`teh` $\rightarrow$ `the`, `recieved` $\rightarrow$ `received`, `wierd` $\rightarrow$ `weird`) and grammatical contractions (`dont` $\rightarrow$ `don't`, `doesnt` $\rightarrow$ `doesn't`).
- **Indefinite Article Agreement (`a` vs `an`)**:
  - Automatically identifies whether the following word starts with a vowel sound:
    - *Example*: `a apple` $\rightarrow$ `an apple`
    - *Example*: `an banana` $\rightarrow$ `a banana`
- **Homophone Confusion**:
  - Distinguishes between possessive `their` and locative `there`:
    - *Example*: `their is a problem` $\rightarrow$ `there is a problem`
  - Distinguishes between possessive `its` and contraction `it's`:
    - *Example*: `its a great day` $\rightarrow$ `it's a great day`
- **Subject-Verb Agreement**:
  - *Example*: `he don't know` $\rightarrow$ `he doesn't know`
  - *Example*: `they doesn't care` $\rightarrow$ `they don't care`
- **Modal Verb Auxiliary Errors**:
  - *Example*: `should of done` $\rightarrow$ `should have done`
- **Duplicated Word Detection**:
  - *Example*: `we will will proceed` $\rightarrow$ `we will proceed`

---

### Italian (`it`)
- **Model**: `models/it-grammar.onnx`
- **Neural Token Spelling & Grammar**: Detects common orthographic issues (`propio` $\rightarrow$ `proprio`, `aereoplano` $\rightarrow$ `aeroplano`, `accellerare` $\rightarrow$ `accelerare`).
- **Mandatory Accent Rules**:
  - Automatically corrects unaccented compound conjunctions:
    - *Example*: `perche` $\rightarrow$ `perché`
    - *Example*: `poiche` $\rightarrow$ `poiché`
  - Distinguishes the verb *essere* (`è`) from the conjunction (`e`):
    - *Example*: `e stato bello` $\rightarrow$ `è stato bello`
- **Truncation vs. Elision (*Troncamento* vs *Elisione*)**:
  - *Qual è* without apostrophe:
    - *Example*: `qual'è` $\rightarrow$ `qual è`
- **Feminine vs. Masculine Indefinite Article Elision**:
  - Feminine `un'` with apostrophe before vowels:
    - *Example*: `un amica` $\rightarrow$ `un'amica`
  - Masculine `un` without apostrophe before vowels:
    - *Example*: `un'amico` $\rightarrow$ `un amico`
- **Idiomatic Expressions**:
  - *Example*: `d accordo` / `da accordo` $\rightarrow$ `d'accordo`

---

### Slovenian (`sl`)
- **Model**: `models/sl-grammar.onnx`
- **Neural Token Spelling & Grammar**: Detects common orthographic issues (`vredu` $\rightarrow$ `v redu`, `navsezadnje` $\rightarrow$ `na vse zadnje`, `zarad` $\rightarrow$ `zaradi`, `nebomo` $\rightarrow$ `ne bomo`).
- **Phonetic Preposition Rules (*Predlog s/z*)**:
  - Slovenian grammar requires preposition **s** before unvoiced consonants (*nezveneči nezvočniki*: **c, č, f, h, k, p, s, š, t** — mnemonic: *"Ta suhi škafec pušča"*), and **z** everywhere else:
    - *Example*: `z prijateljem` $\rightarrow$ `s prijateljem` (p is unvoiced)
    - *Example*: `s bratom` $\rightarrow$ `z bratom` (b is voiced)
    - *Example*: `z kmetom` $\rightarrow$ `s kmetom` (k is unvoiced)
- **Directional Preposition Rules (*Predlog k/h*)**:
  - Preposition **h** is required before words starting with **k** or **g**, and **k** before all other letters:
    - *Example*: `k kmetu` $\rightarrow$ `h kmetu`
    - *Example*: `h hiši` $\rightarrow$ `k hiši`
- **Mandatory Comma Placement before Subordinate Conjunctions**:
  - In Slovenian syntax, subordinate clauses introduced by **ki, ko, ker, da, če** must be preceded by a comma:
    - *Example*: `Vesel sem da si prišel` $\rightarrow$ `Vesel sem, da si prišel`
    - *Example*: `Ostal je doma ker dežuje` $\rightarrow$ `Ostal je doma, ker dežuje`

---

## 5. User Interface Walkthrough

### Toolbar Popup UI
Clicking the extension icon in your browser toolbar opens the quick control panel:
- **Master Toggle**: Enable or disable grammar checking globally across all pages.
- **Engine Status Indicator**:
  - 🟢 **Engine Ready**: Local neural runtime and vocabulary are loaded and running.
  - 🟡 **Loading Model**: Initializing weights in memory.
  - 🔴 **Disabled / Error**: Engine paused or extension disabled.
- **Language Selector**: Instantly switch between **Auto-detect**, **English**, **Italian**, or **Slovenian**. Changing this dropdown immediately pre-warms that language's neural model in the background.
- **Settings Shortcut**: Opens the complete options page.
- **Reload Engine Button**: Flushes cached tensors and reinitializes all models.

### Onboarding & Live Playground
The onboarding page (`onboarding/onboarding.html`) runs automatically on first installation:
- Explains the local privacy model.
- Provides a multilingual language picker.
- Features a **live interactive playground** where you can type sentences with intentional mistakes to see the badge and popover appear in real time.

### Settings & Site Management
Accessible via right-clicking the extension icon $\rightarrow$ **Options**, or via the popup:
- **Default Language Engine**: Set your primary writing language.
- **Per-Site Permissions & Blocklist**:
  - Add sensitive websites (such as `secure.bank.com`, intranet dashboards, or password managers) to the blocklist.
  - nodaysrammar will completely disable all listeners, hooks, and overlays on those domains.
- **On-Device Model Runtime Status**:
  - Displays live health status for all three models:
    - `English Model (en-grammar.onnx)`
    - `Italian Model (it-grammar.onnx)`
    - `Slovenian Model (sl-grammar.onnx)`
- **Purge Cache & Reload Models**: Reloads all three models from disk in parallel.
- **Reset to Defaults**: Restores factory settings.

### Inline Interactive Badge & Suggestion Cards
When you focus on an editable field on any webpage:
1. **The Corner Badge**:
   - If no errors exist: Displays a discreet blue badge (`✓`).
   - If errors exist: Displays an accent badge (`⚡ <count>`) indicating the number of suggestions found.
2. **Reviewing Mistakes**:
   - Click the badge to open the floating popover card.
   - Each card displays:
     - The rule or reason for the correction.
     - A visual diff: `<original>` $\rightarrow$ `<replacement>`.
     - **Accept** button: Applies the correction in place and moves the caret forward.
     - **Ignore** button: Dismisses the card for the current session.

---

## 6. Local ONNX Models & Training Pipeline

### Model Technical Specifications
Each model in `models/` is a standard ONNX binary file (Open Neural Network Exchange):
- `models/en-grammar.onnx`: 30,891 bytes
- `models/it-grammar.onnx`: 24,744 bytes
- `models/sl-grammar.onnx`: 24,232 bytes
- **IR Version**: 9
- **Opset Version**: 17

### Mathematical Formulation
```
Input: input_ids ∈ ℤ^(1 × L)
Step 1: E ∈ ℝ^(V × 32)            --> Token embedding lookup
Step 2: W1 ∈ ℝ^(32 × 64), B1 ∈ ℝ^64 --> Dense Hidden Projection with ReLU
Step 3: W2 ∈ ℝ^(64 × 5),  B2 ∈ ℝ^5  --> Classification Logits
Step 4: y_pred = argmax(Logits)   --> Class: {0: OK, 1: SPELL, 2: GRAMMAR, 3: PREP, 4: PUNCT}
```

### Reproducing or Extending the Models
You can retrain or add vocabulary entries to the models at any time using the included script:
```bash
# 1. Edit clean words, spellings, or grammar patterns in scripts/generate_real_models.py
# 2. Run the generator script:
python3 scripts/generate_real_models.py

# 3. Reload the extension in chrome://extensions to load updated weights
```

---

## 7. Troubleshooting & FAQ

### Q: Why do models show "UNINITIALIZED" in the Options page?
**A**: This was resolved in the latest update. Background models are now pre-warmed concurrently on startup and whenever the Options page is viewed. If you see this after updating, click the **"Purge Cache & Reload Models"** button in Settings or click the **Reload (↺)** icon on the extension card in `chrome://extensions`.

### Q: Does nodaysrammar work on Google Docs?
**A**: Google Docs renders text via an HTML5 `<canvas>` element rather than standard DOM inputs or contenteditable elements. nodaysrammar functions across standard web forms, textareas, Gmail, Notion, Reddit, GitHub, Slack web, WordPress, and all contenteditable fields.

### Q: Why doesn't the extension work on `chrome://extensions` or the Chrome Web Store?
**A**: For security, Google Chrome explicitly blocks all extensions from injecting content scripts into `chrome://` system URLs and the official Chrome Web Store domain (`chromewebstore.google.com`). This is a security constraint enforced by the browser.

### Q: How do I disable the extension on a specific website?
**A**: Open the **Options** page, scroll down to **Per-Site Permissions & Blocklist**, enter the domain (e.g., `github.com` or `banking.example.com`), and click **Add Domain** followed by **Save Changes**.

---

*nodaysrammar — Developed with Google Chrome Manifest V3, WebAssembly, and On-Device Neural Architecture.*
