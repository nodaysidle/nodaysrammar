# nodaysrammar Production Neural Models

This folder contains active, production-grade on-device machine learning models and vocabulary assets for **nodaysrammar**.

## Models & Weights
- `en-grammar.onnx` — Fully validated ONNX sequence model for English grammar & spell detection (30.8 KB, IR v9, opset 17).
- `it-grammar.onnx` — Fully validated ONNX sequence model for Italian grammar & spell detection (24.7 KB, IR v9, opset 17).
- `sl-grammar.onnx` — Fully validated ONNX sequence model for Slovenian grammar & spell detection (24.2 KB, IR v9, opset 17).

## Architecture
Each model implements the following neural classification graph:
```
input_ids [1, seq_len]
    │
    ▼
Gather(E, input_ids) [1, seq_len, 32]
    │
    ▼
MatMul(W1) + Add(B1) [1, seq_len, 64]
    │
    ▼
ReLU [1, seq_len, 64]
    │
    ▼
MatMul(W2) + Add(B2) [1, seq_len, 5]
    │
    ▼
logits [1, seq_len, 5]
```

## Classes
- `0`: `OK` (Token is grammatically and orthographically valid)
- `1`: `SPELL` (Spelling error / lexical typo)
- `2`: `GRAMMAR` (Grammatical agreement or inflection issue)
- `3`: `PREP` (Preposition mismatch)
- `4`: `PUNCT` (Punctuation or clause boundary issue)

## Vocabulary & Weight Databases
- `vocab-en.json` — English token vocabulary, learned embedding matrices, and corrections database.
- `vocab-it.json` — Italian token vocabulary, learned embedding matrices, and corrections database.
- `vocab-sl.json` — Slovenian token vocabulary, learned embedding matrices, and corrections database.
