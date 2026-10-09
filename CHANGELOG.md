# Changelog

## 1.0.1

- Remove unused ONNX/WASM runtime (`lib/`, `*.onnx`); inference is plain JS over `models/vocab-*.json` plus dictionaries and regex rules.
- Honest docs: fixed per-token label tables (seed 42, not trained); drop neural/WASM/production-grade claims.
- Tighten Manifest V3 permissions: `storage` only; remove `activeTab`, `scripting`, `host_permissions`, and `web_accessible_resources`.
- Blocklist: content script checks `chrome.storage.sync` before attaching listeners and reacts to changes.
- English rules aligned with code: a/an (incl. silent-h), linking verb + adverb, their/there, its/it's, could/should/would of, he don't / they doesn't, I has, repeated words.
- REEL fixes: don't re-flag after Fix All; `realy` → `really`; focus restored after suggestion card closes.
- Release workflow (`v*` tags) builds `NODAYSIDLE-nodaysrammar-<version>-chrome.zip` + `.sha256`; CI runs unit + headless browser tests.
- Display name: **NODAYSIDLE nodaysrammar** (package name remains `nodaysrammar`).

## 1.0.0

- Initial public release of the on-device multilingual grammar checker (EN / IT / SL).
