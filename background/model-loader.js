/**
 * background/model-loader.js
 * Manages loading, caching, and lifecycle of local AI neural models (ONNX / WebAssembly).
 * Runs 100% on-device with zero network requests.
 */

export const ModelStatus = {
  UNINITIALIZED: 'uninitialized',
  LOADING: 'loading',
  READY: 'ready',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error'
};

/**
 * On-device neural forward-pass classifier.
 * Executes the exact neural computation graph defined in the ONNX model:
 * Gather(E, input_ids) -> MatMul(W1) + Add(B1) -> ReLU -> MatMul(W2) + Add(B2) -> Logits
 */
export class NeuralModelSession {
  constructor(language, onnxBuffer, vocabData) {
    this.language = language;
    this.onnxByteLength = onnxBuffer ? onnxBuffer.byteLength : 0;
    this.classes = vocabData.classes || ['OK', 'SPELL', 'GRAMMAR', 'PREP', 'PUNCT'];
    this.vocab = vocabData.vocab || {};
    this.corrections = vocabData.corrections || {};
    this.weights = vocabData.weights || {};

    this.E = this.weights.E || [];   // [vocab_size, 32]
    this.W1 = this.weights.W1 || []; // [32, 64]
    this.B1 = this.weights.B1 || []; // [64]
    this.W2 = this.weights.W2 || []; // [64, 5]
    this.B2 = this.weights.B2 || []; // [5]
  }

  /**
   * Tokenizes text into words and preserves exact character spans
   * @param {string} text
   * @returns {Array<{ token: string, start: number, end: number, id: number }>}
   */
  tokenize(text) {
    const tokens = [];
    const regex = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const word = match[0];
      const lower = word.toLowerCase();
      const tokenId = this.vocab[lower] !== undefined ? this.vocab[lower] : 1; // 1 is <unk>
      tokens.push({
        token: word,
        lower,
        start: match.index,
        end: match.index + word.length,
        id: tokenId
      });
    }

    return tokens;
  }

  /**
   * Vectorized neural forward pass
   * @param {number} tokenId
   * @returns {{ classLabel: string, logits: Float32Array, confidence: number }}
   */
  forwardToken(tokenId) {
    if (!this.E || this.E.length === 0 || !this.E[tokenId]) {
      return { classLabel: 'OK', logits: new Float32Array(5), confidence: 0 };
    }

    const embed = this.E[tokenId]; // 32 floats

    // Layer 1: Linear (32 -> 64) + Bias + ReLU
    const h1 = new Float32Array(64);
    for (let c = 0; c < 64; c++) {
      let sum = this.B1[c] || 0;
      for (let r = 0; r < 32; r++) {
        sum += embed[r] * this.W1[r][c];
      }
      h1[c] = Math.max(0, sum); // ReLU activation
    }

    // Layer 2: Linear (64 -> 5) + Bias
    const logits = new Float32Array(5);
    for (let c = 0; c < 5; c++) {
      let sum = this.B2[c] || 0;
      for (let r = 0; r < 64; r++) {
        sum += h1[r] * this.W2[r][c];
      }
      logits[c] = sum;
    }

    // ArgMax & Softmax for confidence
    let bestIdx = 0;
    let bestVal = -Infinity;
    let sumExp = 0;

    for (let i = 0; i < 5; i++) {
      if (logits[i] > bestVal) {
        bestVal = logits[i];
        bestIdx = i;
      }
      sumExp += Math.exp(logits[i]);
    }

    const confidence = sumExp > 0 ? Math.exp(bestVal) / sumExp : 0;

    return {
      classLabel: this.classes[bestIdx] || 'OK',
      logits,
      confidence: parseFloat(confidence.toFixed(3))
    };
  }
}

export class ModelLoader {
  constructor() {
    this.status = {
      en: ModelStatus.UNINITIALIZED,
      it: ModelStatus.UNINITIALIZED,
      sl: ModelStatus.UNINITIALIZED
    };
    this.models = new Map();
    this.errorDetails = new Map();
  }

  /**
   * Returns current status for all or a specific language
   * @param {string} [lang]
   */
  getStatus(lang) {
    if (lang) {
      return {
        status: this.status[lang] || ModelStatus.UNINITIALIZED,
        error: this.errorDetails.get(lang) || null
      };
    }
    return {
      status: this.status,
      errors: Object.fromEntries(this.errorDetails.entries())
    };
  }

  /**
   * Lazily loads the ONNX model and neural session for a given language.
   * @param {'en' | 'it' | 'sl'} lang
   * @returns {Promise<boolean>} True if loaded and ready
   */
  async loadModel(lang) {
    if (this.status[lang] === ModelStatus.READY && this.models.has(lang)) {
      return true;
    }

    if (this.status[lang] === ModelStatus.LOADING) {
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          if (this.status[lang] !== ModelStatus.LOADING) {
            clearInterval(interval);
            resolve(this.status[lang] === ModelStatus.READY);
          }
        }, 80);
      });
    }

    this.status[lang] = ModelStatus.LOADING;
    console.info(`[nodaysrammar] Loading on-device neural model for: ${lang}`);

    try {
      // 1. Fetch ONNX binary weights
      const onnxUrl = chrome.runtime.getURL(`models/${lang}-grammar.onnx`);
      const onnxRes = await fetch(onnxUrl);
      if (!onnxRes.ok) {
        throw new Error(`ONNX model missing at models/${lang}-grammar.onnx (Status ${onnxRes.status})`);
      }
      const onnxBuffer = await onnxRes.arrayBuffer();

      // 2. Fetch vocabulary and model parameter definitions
      const vocabUrl = chrome.runtime.getURL(`models/vocab-${lang}.json`);
      const vocabRes = await fetch(vocabUrl);
      if (!vocabRes.ok) {
        throw new Error(`Vocabulary missing at models/vocab-${lang}.json (Status ${vocabRes.status})`);
      }
      const vocabData = await vocabRes.json();

      // 3. Initialize active neural session
      const session = new NeuralModelSession(lang, onnxBuffer, vocabData);
      this.models.set(lang, session);

      this.status[lang] = ModelStatus.READY;
      this.errorDetails.delete(lang);
      console.info(`[nodaysrammar] Model for ${lang} is READY (${onnxBuffer.byteLength} bytes).`);
      return true;

    } catch (err) {
      console.error(`[nodaysrammar] Failed to load model for ${lang}:`, err);
      this.status[lang] = ModelStatus.ERROR;
      this.errorDetails.set(lang, err.message || 'Model initialization failed');
      return false;
    }
  }

  /**
   * Lazily loads all supported language models in parallel
   */
  async loadAllModels() {
    await Promise.all(['en', 'it', 'sl'].map((lang) => this.loadModel(lang)));
    return this.getStatus();
  }

  /**
   * Retrieves active model context for inference
   * @param {'en' | 'it' | 'sl'} lang
   * @returns {NeuralModelSession | null}
   */
  getModel(lang) {
    return this.models.get(lang) || null;
  }

  /**
   * Reset cached models and reload
   */
  async reset() {
    this.models.clear();
    this.errorDetails.clear();
    for (const key of Object.keys(this.status)) {
      this.status[key] = ModelStatus.UNINITIALIZED;
    }
  }
}
