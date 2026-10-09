/**
 * background/language-detector.js
 * On-device n-gram and stopword language detector for English, Italian, and Slovenian.
 * Runs completely locally without external network calls.
 */

export class LanguageDetector {
  constructor() {
    // High-frequency functional tokens / stop words unique to each supported language
    this.lexicon = {
      en: new Set([
        'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for',
        'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by',
        'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one',
        'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about',
        'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no',
        'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some',
        'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come'
      ]),
      it: new Set([
        'il', 'la', 'di', 'e', 'che', 'un', 'in', 'a', 'per', 'una', 'sono', 'mi',
        'si', 'ho', 'ma', 'ha', 'non', 'da', 'ci', 'lo', 'le', 'ti', 'con', 'se',
        'come', 'io', 'cosa', 'questo', 'lei', 'lui', 'della', 'del', 'nel', 'tutto',
        'più', 'mio', 'ancora', 'bene', 'sei', 'chi', 'era', 'sul', 'sulla', 'ogni',
        'anche', 'molto', 'dove', 'perché', 'fatto', 'quando', 'ora', 'senza', 'dopo',
        'grazie', 'ciao', 'sempre', 'prima', 'questa', 'loro', 'stato', 'stata', 'fare'
      ]),
      sl: new Set([
        'in', 'je', 'da', 'se', 'na', 'ne', 'za', 'ki', 'pa', 'bi', 'so', 'kot',
        'bo', 'tudi', 'ali', 'z', 'pri', 'po', 'lahko', 'že', 'le', 'tako', 'do',
        'sem', 'ga', 'od', 'te', 'kar', 'med', 'ti', 'jaz', 'ko', 'ker', 'kaj',
        'bila', 'bil', 'si', 'tem', 'zelo', 'kako', 'več', 'samo', 'še', 'kjer',
        'prišel', 'glede', 'zaradi', 'vsak', 'vendar', 'pred', 'čeprav', 'nam',
        'vam', 'bomo', 'boste', 'toda', 'lep', 'dan', 'hvala', 'življenje', 'ampak'
      ])
    };

    // Distinct character n-grams and diacritics
    this.diacritics = {
      sl: /[čšžČŠŽ]/,
      it: /[àèéìíîòóùúÀÈÉÌÍÎÒÓÙÚ]/
    };
  }

  /**
   * Detects the dominant language in the provided text.
   * @param {string} text - Input text from user field
   * @param {string} fallbackLang - Fallback language code ('en', 'it', 'sl')
   * @returns {{ language: string, confidence: number }}
   */
  detect(text, fallbackLang = 'en') {
    if (!text || typeof text !== 'string' || text.trim().length < 5) {
      return { language: fallbackLang, confidence: 0.0 };
    }

    const cleanText = text.toLowerCase();
    const tokens = cleanText
      .replace(/[^\p{L}\s]/gu, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);

    if (tokens.length === 0) {
      return { language: fallbackLang, confidence: 0.0 };
    }

    const scores = { en: 0, it: 0, sl: 0 };

    // 1. Check diacritic fingerprints
    if (this.diacritics.sl.test(text)) {
      scores.sl += 3;
    }
    if (this.diacritics.it.test(text)) {
      scores.it += 3;
    }

    // 2. Tally token lexicon overlap
    for (const token of tokens) {
      if (this.lexicon.en.has(token)) scores.en += 1.5;
      if (this.lexicon.it.has(token)) scores.it += 1.5;
      if (this.lexicon.sl.has(token)) scores.sl += 1.5;
    }

    // Determine the highest scoring language
    let highestLang = fallbackLang;
    let maxScore = 0;

    for (const [lang, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        highestLang = lang;
      }
    }

    const totalScore = scores.en + scores.it + scores.sl;
    const confidence = totalScore > 0 ? Math.min(1.0, maxScore / (totalScore + 0.5)) : 0.0;

    return {
      language: maxScore > 0 ? highestLang : fallbackLang,
      confidence: parseFloat(confidence.toFixed(2))
    };
  }
}
