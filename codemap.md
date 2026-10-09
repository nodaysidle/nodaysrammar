# Codemap — NODAYSIDLE nodaysrammar

## Overview
**NODAYSIDLE nodaysrammar** is an on-device, zero-telemetry multilingual grammar and spell checking browser extension for Chromium-based browsers (Chrome, Brave, Edge, Arc) built with Manifest V3. It runs entirely locally using a small JS classifier over fixed `vocab-*.json` label tables, ~35,000-word offline frequency dictionaries, and grammar rules for English (`en`), Italian (`it`), and Slovenian (`sl`).

---

## Architecture Map

```
nodaysrammar/
├── manifest.json                  # Manifest V3 (permission: storage)
├── AGENTS.md                      # Specification & engineering invariants
├── CLAUDE.md                      # Agent entrypoint pointer (@AGENTS.md)
├── codemap.md                     # Architecture map (this file)
├── LICENSE                        # MIT License
├── README.md                      # Product documentation
├── USERGUIDE.md                   # User & troubleshooting guide
├── CHANGELOG.md                   # Release history
├── package.json                   # Metadata & scripts (name: nodaysrammar)
│
├── background/
│   ├── service-worker.js          # IPC router, settings, domain block check
│   ├── model-loader.js            # vocab-*.json loader & JS forward pass
│   ├── inference-engine.js        # Classifier + dictionaries + regex rules
│   ├── spell-corrector.js         # Dictionary + ranked Levenshtein suggestions
│   └── language-detector.js       # n-gram language detector (EN/IT/SL)
│
├── content/
│   ├── content-script.js          # Observer, blocklist gate, Shadow DOM overlay
│   ├── field-detector.js          # Editable field helpers (module copy)
│   ├── overlay-manager.js         # Overlay helpers (module copy)
│   └── content.css                # Host container styles
│
├── popup/ · options/ · onboarding/
│
├── models/
│   ├── vocab-{en,it,sl}.json      # Fixed per-token label tables (seed 42, not trained)
│   └── dict-{en,it,sl}.json       # ~35k-word frequency dictionaries
│
├── assets/icons/                  # icon-16/32/48/128.png
├── scripts/generate_real_models.py
├── tests/                         # test-live, test-autofix, test-regressions
└── .github/workflows/             # ci.yml, release.yml
```
