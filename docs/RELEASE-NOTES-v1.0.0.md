# nodaysrammar v1.0.0

On-device, zero-telemetry multilingual grammar and spell checker browser extension for Chromium (Manifest V3).

---

## Highlights

- **100% On-Device & Zero Telemetry**: Operates completely in-browser with zero remote API calls. Keystrokes never leave client memory.
- **WASM Neural Classifier**: Bundled ONNX Runtime Web evaluates token syntax using pre-trained models (`en-grammar.onnx`, `it-grammar.onnx`, `sl-grammar.onnx`).
- **35,000-Word Frequency Dictionaries**: Instant offline spelling validation for English (`en`), Italian (`it`), and Slovenian (`sl`) with Levenshtein candidate generation.
- **Isolated Shadow DOM Overlay**: Visual squiggly underline highlights, floating badge count, and suggestion popover render in an isolated Shadow DOM (`#nodaysrammar-root`), preventing style collision with host websites.
- **Smart Ergonomics**:
  - Auto-flipping popover positioning based on viewport proximity (top/bottom).
  - Single-click suggestion replacement with undo stack preservation (`execCommand('insertText')`).
  - "Fix All" bulk error resolution.
  - Optional real-time auto-fix on spacebar.

---

## Included Assets & Checksums

| File | Size | Description |
| --- | --- | --- |
| `models/en-grammar.onnx` | 31 KB | English neural token classifier (opset 17) |
| `models/it-grammar.onnx` | 25 KB | Italian neural token classifier (opset 17) |
| `models/sl-grammar.onnx` | 24 KB | Slovenian neural token classifier (opset 17) |
| `models/dict-en.json` | 565 KB | 35k-word English offline dictionary |
| `models/dict-it.json` | 583 KB | 35k-word Italian offline dictionary |
| `models/dict-sl.json` | 563 KB | 35k-word Slovenian offline dictionary |
| `lib/ort.bundle.min.mjs` | 468 KB | ONNX Runtime Web WASM engine |

---

## Installation & Testing

1. Clone or download the repository:
   ```bash
   git clone https://github.com/nodaysidle/nodaysrammar.git
   cd nodaysrammar
   ```
2. Open Chromium, Chrome, or Brave:
   - Navigate to `chrome://extensions`
   - Enable **Developer mode** (toggle in upper right)
   - Click **Load unpacked**
   - Select the `nodaysrammar` repository directory
3. Run automated live test suite:
   ```bash
   npm test
   ```
