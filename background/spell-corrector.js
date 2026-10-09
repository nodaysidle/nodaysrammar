/**
 * background/spell-corrector.js
 * High-performance, offline, on-device dictionary and spell correction engine.
 * Supports English (35k words), Italian (35k words), and Slovenian (35k words).
 * Runs candidate generation and frequency scoring in <1ms without network calls.
 */

export class SpellCorrector {
  constructor() {
    this.dictionaries = new Map(); // lang -> Map<string, number>
    this.loadingPromises = new Map();
    this.alphabets = {
      en: 'abcdefghijklmnopqrstuvwxyz',
      it: 'abcdefghijklmnopqrstuvwxyzàèéìíîòóùú',
      sl: 'abcčdefghijklmnoprsštuvzž'
    };
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
        const map = new Map();
        for (const [w, count] of Object.entries(data)) {
          map.set(w, count);
        }
        this.dictionaries.set(lang, map);
        console.info(`[nodaysrammar] Spell dictionary for ${lang} loaded (${map.size} words).`);
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
   * Checks if a word is in the dictionary
   * @param {string} word
   * @param {'en' | 'it' | 'sl'} lang
   * @returns {boolean}
   */
  isKnown(word, lang = 'en') {
    const dict = this.dictionaries.get(lang);
    if (!dict) return true; // Fail safe
    return dict.has(word.toLowerCase());
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

    const lower = word.toLowerCase();
    // If it's already a valid known word, no suggestion needed
    if (dict.has(lower)) return null;

    // Skip numbers, emails, URLs, or single letters (unless common typo)
    if (lower.length <= 1 || /\d/.test(lower)) return null;

    const alphabet = this.alphabets[lang] || this.alphabets.en;
    const len = lower.length;

    // 1. Generate Distance 1 edits
    const edits1 = [];

    // Deletions & Replaces & Transpositions
    for (let i = 0; i < len; i++) {
      // Delete char at i
      edits1.push(lower.slice(0, i) + lower.slice(i + 1));

      // Transpose adjacent chars
      if (i < len - 1) {
        edits1.push(lower.slice(0, i) + lower[i + 1] + lower[i] + lower.slice(i + 2));
      }

      // Replace char at i with alphabet letters
      for (let j = 0; j < alphabet.length; j++) {
        edits1.push(lower.slice(0, i) + alphabet[j] + lower.slice(i + 1));
      }
    }

    // Insertions at each position
    for (let i = 0; i <= len; i++) {
      for (let j = 0; j < alphabet.length; j++) {
        edits1.push(lower.slice(0, i) + alphabet[j] + lower.slice(i));
      }
    }

    // Check distance 1 candidates
    let bestWord = null;
    let maxFreq = -1;

    for (const cand of edits1) {
      const f = dict.get(cand);
      if (f !== undefined && f > maxFreq) {
        maxFreq = f;
        bestWord = cand;
      }
    }

    if (bestWord) {
      return this.matchCasing(word, bestWord);
    }

    // 2. Distance 2 edits for repeated characters (e.g., 'tomorrrow' -> triple r)
    // Collapse repeated letters (e.g. 3 of same char -> 2 or 1)
    const collapsed = lower.replace(/(.)\1{2,}/g, '$1$1');
    if (collapsed !== lower) {
      if (dict.has(collapsed)) return this.matchCasing(word, collapsed);
      const once = lower.replace(/(.)\1{2,}/g, '$1');
      if (dict.has(once)) return this.matchCasing(word, once);
    }

    // Distance 2 candidate search (for words length <= 10 to keep < 2ms)
    if (len <= 10) {
      for (const e1 of edits1) {
        const e1len = e1.length;
        // deletions
        for (let i = 0; i < e1len; i++) {
          const e2 = e1.slice(0, i) + e1.slice(i + 1);
          const f = dict.get(e2);
          if (f !== undefined && f > maxFreq) {
            maxFreq = f;
            bestWord = e2;
          }
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
    if (original.length > 0 && original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
      return suggestion[0].toUpperCase() + suggestion.slice(1);
    }
    if (original.length > 1 && original === original.toUpperCase()) {
      return suggestion.toUpperCase();
    }
    return suggestion;
  }
}
