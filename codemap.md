# Codemap — nodaysrammar

## Overview
**nodaysrammar** is an on-device, zero-telemetry multilingual grammar and spell checking browser extension for Chromium-based browsers (Chrome, Brave, Edge, Arc) built natively with Manifest V3. It operates 100% locally using ONNX Runtime Web (WASM) and 35,000-word offline frequency dictionaries across English (`en`), Italian (`it`), and Slovenian (`sl`).

---

## Architecture Map

```
nodaysrammar/
├── manifest.json                  # Manifest V3 specification & permission sandboxing
├── AGENTS.md                      # Specification, IPC contracts & engineering invariants
├── CLAUDE.md                      # Agent entrypoint pointer (@AGENTS.md)
├── codemap.md                     # Architecture map & directory navigation (this file)
├── LICENSE                        # MIT License (2026 nodaysidle)
├── README.md                      # Portfolio-aligned documentation, architecture & badges
├── USERGUIDE.md                   # Complete user, developer & troubleshooting guide
├── package.json                   # Project metadata, dependencies & test scripts
│
├── background/                    # Background Service Worker & Model Inferences
│   ├── service-worker.js          # Service worker entrypoint & message routing
│   ├── model-loader.js            # ONNX model loader & WASM tensor execution
│   ├── inference-engine.js        # Multilingual neural & syntactic grammar evaluator
│   ├── spell-corrector.js         # 35,000-word offline dictionary & Levenshtein generator
│   └── language-detector.js       # Tri-gram fast on-device language detector (EN/IT/SL)
│
├── content/                       # Content Script & Shadow DOM Injection
│   ├── content-script.js          # Editable field observer, debounce & replacement dispatcher
│   ├── field-detector.js          # Input/textarea/contenteditable detection
│   ├── overlay-manager.js         # Isolated Shadow DOM: badges, squiggly highlights, popover card
│   └── content.css                # Scoped host container styles
│
├── popup/                         # Action Toolbar Popup
│   ├── popup.html                 # Toolbar popup DOM
│   ├── popup.js                   # Extension state toggle, live language indicator
│   └── popup.css                  # Dark/light glassmorphic styling
│
├── options/                       # Options / Settings Dashboard
│   ├── options.html               # Options markup (allowlists, custom words, rules)
│   ├── options.js                 # Configuration storage synchronization
│   └── options.css                # Settings layout styling
│
├── onboarding/                    # Welcome & Interactive Sandbox
│   ├── onboarding.html            # Welcome tour & live interactive playground
│   ├── onboarding.js              # Onboarding interactive controller
│   └── onboarding.css             # Onboarding stylesheet
│
├── models/                        # Pre-trained Offline Neural Models & Vocabularies
│   ├── README.md                  # Model architecture and export documentation
│   ├── en-grammar.onnx            # English neural token classifier (opset 17)
│   ├── it-grammar.onnx            # Italian neural token classifier (opset 17)
│   ├── sl-grammar.onnx            # Slovenian neural token classifier (opset 17)
│   ├── vocab-en.json              # English vocabulary & grammar patterns
│   ├── vocab-it.json              # Italian vocabulary & grammar patterns
│   ├── vocab-sl.json              # Slovenian vocabulary & grammar patterns
│   ├── dict-en.json               # 35,000-word English frequency dictionary
│   ├── dict-it.json               # 35,000-word Italian frequency dictionary
│   └── dict-sl.json               # 35,000-word Slovenian frequency dictionary
│
├── lib/                           # Vendor Libraries
│   └── ort.bundle.min.mjs         # Bundled ONNX Runtime Web (WASM execution)
│
├── assets/                        # Icons and Brand Assets
│   ├── icon.svg                   # Vector logo
│   └── icons/                     # Generated PNG icons (16, 32, 48, 128)
│
├── scripts/                       # Model Training & Asset Generation
│   └── generate_real_models.py    # Python training & ONNX export pipeline
│
├── tests/                         # End-to-End Headless & Headed Browser Tests
│   ├── test-live.js               # Comprehensive 12-step Puppeteer live test suite
│   ├── test-autofix.js            # Spacebar auto-fix and "Fix All" workflow tests
│   └── test-page.html             # Multi-input test fixture (textarea, inputs, contenteditable)
│
└── screenshots/                   # Verification Screenshots
    ├── 01-initial-clean.png
    ├── 02-english-errors.png
    ├── 03-italian-errors.png
    ├── 04-slovenian-errors.png
    ├── 05-contenteditable-errors.png
    ├── 06-underline-inspection.png
    ├── 07-badge-clicked.png
    ├── 08-card-hover.png
    ├── 09-error-fixed.png
    ├── 10-all-fixed.png
    ├── 11-options-page.png
    └── 12-onboarding-page.png
```
