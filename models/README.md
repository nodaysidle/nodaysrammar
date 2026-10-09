# Models — NODAYSIDLE nodaysrammar

This folder holds the on-device assets used by the small JS classifier and spell checker:

| File | Role |
| --- | --- |
| `vocab-en.json` / `vocab-it.json` / `vocab-sl.json` | Fixed per-token label tables + embedding weights + correction maps |
| `dict-en.json` / `dict-it.json` / `dict-sl.json` | ~35,000-word frequency dictionaries for Levenshtein suggestions |

## How the label tables are built

`scripts/generate_real_models.py` generates the `vocab-*.json` files with **deterministic random weights (numpy seed 42)** and **forced class labels** for known misspellings/grammar tokens. They are **not trained** and are not ONNX/WASM models.

The runtime forward pass (in `background/model-loader.js`) is plain JavaScript:

```
Gather(E) → Linear(32→64) + ReLU → Linear(64→5) → argmax
```

Classes: `OK`, `SPELL`, `GRAMMAR`, `PREP`, `PUNCT`.

Regenerate:

```bash
python3 scripts/generate_real_models.py
```
