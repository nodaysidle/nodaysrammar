/**
 * background/spell-corrector.js
 * High-performance, offline, on-device dictionary and spell correction engine.
 * Supports English (35k words), Italian (35k words), and Slovenian (35k words).
 * Runs candidate generation and frequency scoring in <1ms without network calls.
 */

/** Normalize curly/typographic apostrophes to ASCII U+0027 */
export function normalizeApostrophes(word) {
  return String(word || '').replace(/[\u2019\u2018\u02BC\u0060\u00B4]/g, "'");
}

export class SpellCorrector {
  constructor() {
    this.dictionaries = new Map(); // lang -> Map<string, number>
    this.loadingPromises = new Map();
    this.misspellings = new Map(); // lang -> Map<misspelled, correction>
    this.knownGood = new Map(); // lang -> Set of known-correct forms (incl. contraction targets)
    this.alphabets = {
      en: 'abcdefghijklmnopqrstuvwxyz',
      it: 'abcdefghijklmnopqrstuvwxyzàèéìíîòóùú',
      sl: 'abcčdefghijklmnoprsštuvzž'
    };
  }

  /**
   * Register correction pairs so targets are treated as correctly spelled
   * and sources are never accepted as "known" even if present in the frequency dict.
   * @param {'en'|'it'|'sl'} lang
   * @param {Record<string, string>} corrections
   */
  registerCorrections(lang, corrections = {}) {
    if (!this.misspellings.has(lang)) this.misspellings.set(lang, new Map());
    if (!this.knownGood.has(lang)) this.knownGood.set(lang, new Set());
    const miss = this.misspellings.get(lang);
    const good = this.knownGood.get(lang);
    for (const [src, dest] of Object.entries(corrections)) {
      const from = normalizeApostrophes(src).toLowerCase();
      const to = normalizeApostrophes(dest).toLowerCase();
      miss.set(from, to);
      good.add(to);
      // Also accept whitespace-split multiword corrections' parts as good when single tokens
      if (!to.includes(' ')) {
        good.add(to);
      }
    }
  }

  /**
   * Seed a language dictionary from a plain object (used by tests and optional preload).
   * @param {'en'|'it'|'sl'} lang
   * @param {Record<string, number>} data
   */
  loadDictionaryData(lang, data) {
    const map = new Map();
    for (const [w, count] of Object.entries(data)) {
      map.set(normalizeApostrophes(w).toLowerCase(), count);
    }
    this.dictionaries.set(lang, map);
    if (!this.knownGood.has(lang)) this.knownGood.set(lang, new Set());
    // Common English contractions often absent as full tokens in subtitle-derived dicts
    if (lang === 'en') {
      const contractions = [
        "don't", "doesn't", "can't", "won't", "isn't", "aren't", "wasn't", "weren't",
        "haven't", "hasn't", "hadn't", "wouldn't", "couldn't", "shouldn't",
        "it's", "that's", "what's", "who's", "there's", "here's", "let's",
        "i'm", "you're", "we're", "they're", "i've", "you've", "we've", "they've",
        "i'll", "you'll", "we'll", "they'll", "i'd", "you'd", "we'd", "they'd"
      ];
      const good = this.knownGood.get(lang);
      for (const c of contractions) good.add(c);
    }
    return true;
  }

  /**
   * Lazily loads the dictionary for the specified language
   * @param {'en' | 'it' | 'sl'} lang
   * @returns {Promise<boolean>}
   */
  async loadDictionary(lang) {
    if (this.dictionaries.has(lang)) return true;
    if (this.loadingPromises.has(lang)) return this.loadingPromises.get(lang);

    const promise = (async () => {
      try {
        const url = chrome.runtime.getURL(`models/dict-${lang}.json`);
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`[nodaysrammar] Could not load dictionary for ${lang}: Status ${res.status}`);
          return false;
        }
        const data = await res.json();
        this.loadDictionaryData(lang, data);
        console.info(`[nodaysrammar] Spell dictionary for ${lang} loaded (${this.dictionaries.get(lang).size} words).`);
        return true;
      } catch (err) {
        console.warn(`[nodaysrammar] Error reading dict-${lang}.json:`, err.message);
        return false;
      } finally {
        this.loadingPromises.delete(lang);
      }
    })();

    this.loadingPromises.set(lang, promise);
    return promise;
  }

  /**
   * Checks if a word is in the dictionary (or a known-correct contraction/correction target)
   * @param {string} word
   * @param {'en' | 'it' | 'sl'} lang
   * @returns {boolean}
   */
  isKnown(word, lang = 'en') {
    const dict = this.dictionaries.get(lang);
    if (!dict) return true; // Fail safe
    const lower = normalizeApostrophes(word).toLowerCase();
    const miss = this.misspellings.get(lang);
    if (miss && miss.has(lower)) return false;
    const good = this.knownGood.get(lang);
    if (good && good.has(lower)) return true;
    return dict.has(lower);
  }

  /**
   * Direct correction override (misspelling table), if any
   */
  getDirectCorrection(word, lang = 'en') {
    const miss = this.misspellings.get(lang);
    if (!miss) return null;
    const lower = normalizeApostrophes(word).toLowerCase();
    const dest = miss.get(lower);
    return dest ? this.matchCasing(word, dest) : null;
  }

  /**
   * Score a candidate: prefer closer edit distance, similar length, then frequency.
   * Length-collapsed junk like "rea" for "realy" loses to "really".
   */
  scoreCandidate(word, candidate, freq, editDistance) {
    const lenPenalty = Math.abs(candidate.length - word.length);
    // Strong length penalty so high-freq short stems cannot beat a close full word
    return (freq || 0) / ((1 + editDistance) * Math.pow(1 + lenPenalty, 3));
  }

  /**
   * Finds the best spelling correction for a misspelled word
   * @param {string} word - Original misspelled word
   * @param {'en' | 'it' | 'sl'} lang - Language
   * @returns {string | null} Best suggestion or null
   */
  suggest(word, lang = 'en') {
    const dict = this.dictionaries.get(lang);
    if (!dict) return null;

    const lower = normalizeApostrophes(word).toLowerCase();

    const direct = this.getDirectCorrection(word, lang);
    if (direct) return direct;

    // If it's already a valid known word, no suggestion needed
    if (this.isKnown(lower, lang)) return null;

    // Skip numbers, emails, URLs, or single letters (unless common typo)
    if (lower.length <= 1 || /\d/.test(lower)) return null;

    const alphabet = this.alphabets[lang] || this.alphabets.en;
    const len = lower.length;
    const hasApostrophe = lower.includes("'");

    // 1. Generate Distance 1 edits
    const edits1 = new Set();

    // Deletions & Replaces & Transpositions
    for (let i = 0; i < len; i++) {
      edits1.add(lower.slice(0, i) + lower.slice(i + 1));

      if (i < len - 1) {
        edits1.add(lower.slice(0, i) + lower[i + 1] + lower[i] + lower.slice(i + 2));
      }

      for (let j = 0; j < alphabet.length; j++) {
        edits1.add(lower.slice(0, i) + alphabet[j] + lower.slice(i + 1));
      }
    }

    // Insertions at each position
    for (let i = 0; i <= len; i++) {
      for (let j = 0; j < alphabet.length; j++) {
        edits1.add(lower.slice(0, i) + alphabet[j] + lower.slice(i));
      }
    }

    let bestWord = null;
    let bestScore = -1;

    const consider = (cand, distance) => {
      if (!cand || cand === lower) return;
      // Never strip an apostrophe-contraction back to a bare misspelling form
      if (hasApostrophe && !cand.includes("'") && cand === lower.replace(/'/g, '')) {
        return;
      }
      // Reject known misspellings as candidates
      const miss = this.misspellings.get(lang);
      if (miss && miss.has(cand)) return;

      const good = this.knownGood.get(lang);
      const f = dict.get(cand);
      const known = (good && good.has(cand)) || f !== undefined;
      if (!known) return;
      // Prefer dictionary frequency; knownGood-only contractions get a modest prior
      const freq = f !== undefined ? f : 1000;
      const score = this.scoreCandidate(lower, cand, freq, distance);
      if (score > bestScore) {
        bestScore = score;
        bestWord = cand;
      }
    };

    for (const cand of edits1) {
      consider(cand, 1);
    }

    if (bestWord) {
      return this.matchCasing(word, bestWord);
    }

    // 2. Collapse repeated letters (e.g. tomorrrow)
    const collapsed = lower.replace(/(.)\1{2,}/g, '$1$1');
    if (collapsed !== lower) {
      if (this.isKnown(collapsed, lang)) return this.matchCasing(word, collapsed);
      const once = lower.replace(/(.)\1{2,}/g, '$1');
      if (this.isKnown(once, lang)) return this.matchCasing(word, once);
    }

    // Distance 2: deletions on each edit1 candidate (bounded; keep < 2ms)
    if (len <= 10) {
      for (const e1 of edits1) {
        const e1len = e1.length;
        for (let i = 0; i < e1len; i++) {
          consider(e1.slice(0, i) + e1.slice(i + 1), 2);
        }
      }
    }

    return bestWord ? this.matchCasing(word, bestWord) : null;
  }

  /**
   * Matches original word capitalization
   */
  matchCasing(original, suggestion) {
    if (!suggestion) return suggestion;
    if (suggestion.includes(' ')) {
      // Multi-word: title-case first word only when original was title case
      if (original.length > 0 && original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
        return suggestion[0].toUpperCase() + suggestion.slice(1);
      }
      if (original.length > 1 && original === original.toUpperCase()) {
        return suggestion.toUpperCase();
      }
      return suggestion;
    }
    if (original.length > 0 && original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
      return suggestion[0].toUpperCase() + suggestion.slice(1);
    }
    if (original.length > 1 && original === original.toUpperCase()) {
      return suggestion.toUpperCase();
    }
    return suggestion;
  }
}
