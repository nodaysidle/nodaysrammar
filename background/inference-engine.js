/**
 * background/inference-engine.js
 * On-device multilingual grammar and spell analysis engine.
 * Combines a small JS token classifier (vocab label tables) with dictionaries and regex rules.
 * Generates structured corrections: { start, end, original, replacement, message, ruleId }
 */

// High-frequency English misspellings to guarantee instant real-time catch
const COMMON_EN_MISSPELLINGS = {
  beautifull: 'beautiful',
  teh: 'the',
  recieve: 'receive',
  recieved: 'received',
  seperate: 'separate',
  seperated: 'separated',
  definately: 'definitely',
  untill: 'until',
  goverment: 'government',
  tommorow: 'tomorrow',
  wierd: 'weird',
  alot: 'a lot',
  alright: 'all right',
  truely: 'truly',
  beleive: 'believe',
  calender: 'calendar',
  neccessary: 'necessary',
  embarass: 'embarrass',
  accomodate: 'accommodate',
  occured: 'occurred',
  occurence: 'occurrence',
  begining: 'beginning',
  enviroment: 'environment',
  suprise: 'surprise',
  succesful: 'successful',
  realy: 'really',
  dont: "don't",
  doesnt: "doesn't",
  wont: "won't",
  cant: "can't",
  isnt: "isn't",
  arent: "aren't"
};

/** Words with silent H (vowel sound) that take "an" */
const EN_SILENT_H = /^(hour|honest|honor|honour|heir|herb)s?$/i;
/** Letter-vowel start that is actually a consonant sound (use "a") */
const EN_CONSONANT_SOUND_EXCEPTION = /^(uni(vers|form|que)|use|one|eu|user|unique|european)/i;

function englishTakesAn(word) {
  const w = String(word || '').toLowerCase();
  if (EN_SILENT_H.test(w)) return true;
  if (EN_CONSONANT_SOUND_EXCEPTION.test(w)) return false;
  return /^[aeiou]/i.test(w);
}

import { SpellCorrector } from './spell-corrector.js';

export class InferenceEngine {
  constructor(modelLoader) {
    this.modelLoader = modelLoader;
    this.spellCorrector = new SpellCorrector();
  }

  /**
   * Analyzes text for grammar and spelling issues using the on-device classifier and rules.
   * @param {string} text - Input text from editable field
   * @param {'en' | 'it' | 'sl'} lang - Target language
   * @returns {Promise<Array<{ start: number, end: number, original: string, replacement: string, message: string, ruleId: string }>>}
   */
  async analyze(text, lang) {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // Load on-device classifier & 35k-word dictionary in parallel
    await Promise.all([
      this.modelLoader.loadModel(lang).catch(() => {}),
      this.spellCorrector.loadDictionary(lang).catch(() => {})
    ]);

    const session = this.modelLoader.getModel(lang);
    if (session?.corrections) {
      this.spellCorrector.registerCorrections(lang, session.corrections);
    }
    if (lang === 'en') {
      this.spellCorrector.registerCorrections('en', COMMON_EN_MISSPELLINGS);
    }

    const suggestions = [];
    const detectedRanges = new Set();

    // 1. TOKEN CLASSIFIER & HIGH-FREQUENCY SPELL PASS
    if (session) {
      const tokens = session.tokenize(text);
      for (const tok of tokens) {
        const pred = session.forwardToken(tok.id);
        let replacement = session.corrections ? session.corrections[tok.lower] : null;

        if (!replacement && lang === 'en') {
          replacement = COMMON_EN_MISSPELLINGS[tok.lower];
        }
        if (!replacement) {
          replacement = this.spellCorrector.getDirectCorrection(tok.token, lang);
        }

        // Always honor explicit correction tables (independent of classifier label)
        if (replacement) {
          const rangeKey = `${tok.start}-${tok.end}`;
          if (!detectedRanges.has(rangeKey)) {
            detectedRanges.add(rangeKey);

            // Preserve title case or uppercase
            let adjusted = replacement;
            if (tok.token.length > 0 && tok.token[0] === tok.token[0].toUpperCase() && tok.token.slice(1) === tok.token.slice(1).toLowerCase()) {
              adjusted = replacement[0].toUpperCase() + replacement.slice(1);
            } else if (tok.token.length > 1 && tok.token === tok.token.toUpperCase()) {
              adjusted = replacement.toUpperCase();
            }

            let message = `Possible spelling mistake. Suggested correction: '${adjusted}'`;
            if (pred.classLabel === 'GRAMMAR') {
              message = `Grammatical form issue detected. Did you mean '${adjusted}'?`;
            } else if (pred.classLabel === 'PREP') {
              message = `Incorrect preposition usage. Consider '${adjusted}'.`;
            }

            suggestions.push({
              start: tok.start,
              end: tok.end,
              original: tok.token,
              replacement: adjusted,
              message,
              ruleId: `token_${(pred.classLabel || 'SPELL').toLowerCase()}`
            });
          }
        } else {
          // Dictionary candidate generation for arbitrary unknown misspelled words
          const dictSuggestion = this.spellCorrector.suggest(tok.token, lang);
          if (dictSuggestion) {
            const rangeKey = `${tok.start}-${tok.end}`;
            if (!detectedRanges.has(rangeKey)) {
              detectedRanges.add(rangeKey);
              suggestions.push({
                start: tok.start,
                end: tok.end,
                original: tok.token,
                replacement: dictSuggestion,
                message: `Possible spelling mistake. Suggested correction: '${dictSuggestion}'`,
                ruleId: 'dict_spell'
              });
            }
          }
        }
      }
    } else {
      // Fallback regex word matching when classifier session is initializing
      const wordRegex = /[\p{L}]+(?:['’][\p{L}]+)*/gu;
      let wm;
      while ((wm = wordRegex.exec(text)) !== null) {
        const word = wm[0];
        const wLower = word.toLowerCase();
        let rep = (lang === 'en' ? COMMON_EN_MISSPELLINGS[wLower] : null) || this.spellCorrector.suggest(word, lang);
        if (rep) {
          const rangeKey = `${wm.index}-${wm.index + word.length}`;
          if (!detectedRanges.has(rangeKey)) {
            detectedRanges.add(rangeKey);
            suggestions.push({
              start: wm.index,
              end: wm.index + word.length,
              original: word,
              replacement: rep,
              message: `Possible spelling mistake. Suggested correction: '${rep}'`,
              ruleId: 'fallback_spell'
            });
          }
        }
      }
    }

    // 2. STRUCTURAL SYNTAX & CONTEXT RULES
    switch (lang) {
      case 'en':
        this.runEnglishRules(text, suggestions, detectedRanges);
        break;
      case 'it':
        this.runItalianRules(text, suggestions, detectedRanges);
        break;
      case 'sl':
        this.runSlovenianRules(text, suggestions, detectedRanges);
        break;
      default:
        this.runEnglishRules(text, suggestions, detectedRanges);
    }

    // Sort by character start offset ascending
    return suggestions.sort((a, b) => a.start - b.start);
  }

  /**
   * English contextual syntax rules
   */
  runEnglishRules(text, suggestions, detectedRanges) {
    // 1. Article mismatch by VOWEL SOUND: "a apple" -> "an apple", "a honest" -> "an honest"
    const aAnRegex = /\b(a|an)\s+([a-zA-Z]+)\b/gi;
    let match;
    while ((match = aAnRegex.exec(text)) !== null) {
      const rangeKey = `${match.index}-${match.index + match[0].length}`;
      if (detectedRanges.has(rangeKey)) continue;

      const article = match[1].toLowerCase();
      const nextWord = match[2];
      const startsWithVowelSound = englishTakesAn(nextWord);

      if (article === 'a' && startsWithVowelSound) {
        suggestions.push({
          start: match.index,
          end: match.index + match[0].length,
          original: match[0],
          replacement: `an ${match[2]}`,
          message: `Use 'an' before words beginning with a vowel sound.`,
          ruleId: 'en_article_vowel'
        });
        detectedRanges.add(rangeKey);
      } else if (article === 'an' && !startsWithVowelSound) {
        suggestions.push({
          start: match.index,
          end: match.index + match[0].length,
          original: match[0],
          replacement: `a ${match[2]}`,
          message: `Use 'a' before words beginning with a consonant sound.`,
          ruleId: 'en_article_consonant'
        });
        detectedRanges.add(rangeKey);
      }
    }

    // 2. Linking verb + adverb error ("is beautifully" -> "is beautiful")
    const linkingVerbAdverbRegex = /\b(is|am|are|was|were|be|been|seems|feels|looks)\s+([a-zA-Z]+ly)\b/gi;
    let lvMatch;
    while ((lvMatch = linkingVerbAdverbRegex.exec(text)) !== null) {
      const verb = lvMatch[1];
      const adverb = lvMatch[2];
      let adj = null;
      if (adverb.toLowerCase().endsWith('fully')) {
        adj = adverb.slice(0, -2);
      } else if (adverb.toLowerCase().endsWith('ly')) {
        const candidate = adverb.slice(0, -2);
        if (this.spellCorrector.isKnown(candidate, 'en')) {
          adj = candidate;
        }
      }
      if (adj) {
        const rangeKey = `${lvMatch.index}-${lvMatch.index + lvMatch[0].length}`;
        if (!detectedRanges.has(rangeKey)) {
          detectedRanges.add(rangeKey);
          suggestions.push({
            start: lvMatch.index,
            end: lvMatch.index + lvMatch[0].length,
            original: lvMatch[0],
            replacement: `${verb} ${adj}`,
            message: `Use predicate adjective '${adj}' instead of adverb '${adverb}' with linking verb '${verb}'.`,
            ruleId: 'en_predicate_adjective'
          });
        }
      }
    }

    // 3. Syntactic patterns (exact set documented in README / USERGUIDE)
    const patterns = [
      {
        regex: /\b(their)\s+(is|are|was|were|will|would|can|could|should|might)\b/gi,
        replace: (m, p1, p2) => `there ${p2}`,
        msg: "Did you mean 'there' instead of 'their'?",
        ruleId: 'en_their_there'
      },
      {
        regex: /\b(there)\s+(own|house|car|dog|cat|friend|friends|parents|mother|father|family|idea|opinion)\b/gi,
        replace: (m, p1, p2) => `their ${p2}`,
        msg: "Did you mean 'their' (possessive) instead of 'there'?",
        ruleId: 'en_there_their'
      },
      {
        regex: /\b(its)\s+(a|an|the|very|not|so|just|been|going|getting|clear|nice|good|bad|important|time|only|also|mine|yours)\b/gi,
        replace: (m, p1, p2) => `it's ${p2}`,
        msg: "Did you mean 'it's' (contraction of 'it is')?",
        ruleId: 'en_its_its'
      },
      {
        regex: /\b(it's)\s+(own|name|place|way|value|purpose)\b/gi,
        replace: (m, p1, p2) => `its ${p2}`,
        msg: "Did you mean possessive 'its' (no apostrophe)?",
        ruleId: 'en_its_possessive'
      },
      {
        regex: /\b(could|should|would)\s+of\b/gi,
        replace: (m, p1) => `${p1} have`,
        msg: "Use 'have' instead of 'of' with modal verbs.",
        ruleId: 'en_modal_of'
      },
      {
        regex: /\b(he|she|it)\s+(don't|dont)\b/gi,
        replace: (m, p1) => `${p1} doesn't`,
        msg: "Subject-verb agreement: use 'doesn't' with third-person singular.",
        ruleId: 'en_sva_doesnt'
      },
      {
        regex: /\b(they|we|you)\s+(doesn't|doesnt)\b/gi,
        replace: (m, p1) => `${p1} don't`,
        msg: "Subject-verb agreement: use 'don't' with plural subjects.",
        ruleId: 'en_sva_dont'
      },
      {
        regex: /\b(I|you|we|they)\s+has\b/g,
        replace: (m, p1) => `${p1} have`,
        msg: "Subject-verb agreement: use 'have' with I/you/we/they.",
        ruleId: 'en_sva_have'
      },
      {
        // Narrow: avoid auxiliaries like "should he have done"
        regex: /\b(he|she|it)\s+have\s+(a|an|the|no|some|many|much)\b/gi,
        replace: (m, p1, p2) => `${p1} has ${p2}`,
        msg: "Subject-verb agreement: use 'has' with he/she/it.",
        ruleId: 'en_sva_has'
      },
      {
        regex: /\b([a-zA-Z]+)\s+\1\b/gi,
        replace: (m, p1) => p1,
        msg: "Duplicated word detected.",
        ruleId: 'en_repeated_word'
      }
    ];

    for (const pat of patterns) {
      let m;
      const re = new RegExp(pat.regex);
      while ((m = re.exec(text)) !== null) {
        const rangeKey = `${m.index}-${m.index + m[0].length}`;
        if (!detectedRanges.has(rangeKey)) {
          suggestions.push({
            start: m.index,
            end: m.index + m[0].length,
            original: m[0],
            replacement: pat.replace(m, m[1], m[2]),
            message: pat.msg,
            ruleId: pat.ruleId || 'en_context_rule'
          });
          detectedRanges.add(rangeKey);
        }
      }
    }
  }

  /**
   * Italian contextual syntax rules
   */
  runItalianRules(text, suggestions, detectedRanges) {
    const rules = [
      {
        regex: /\b(perche|poiche|affinche|benche)\b/gi,
        replace: (m, p1) => p1.toLowerCase() === 'perche' ? 'perché' : `${p1.slice(0, -1)}é`,
        msg: "Le congiunzioni composte richiedono l'accento acuto finale (es. 'perché').",
        ruleId: 'it_accent_compound'
      },
      {
        regex: /\b(e)\s+(stato|stata|stati|state|vero|bello|chiaro|possibile)\b/gi,
        replace: (m, p1, p2) => `è ${p2}`,
        msg: "Usa la terza persona del verbo essere con accento grave ('è') invece della congiunzione 'e'.",
        ruleId: 'it_verb_essere'
      },
      {
        regex: /\bqual['’]è\b/gi,
        replace: () => 'qual è',
        msg: "'Qual è' si scrive senza apostrofo (è un troncamento, non un'elisione).",
        ruleId: 'it_quale'
      },
      {
        regex: /\bun\s+(amica|ora|anima|idea|emozione|illusione)\b/gi,
        replace: (m, p1) => `un'${p1}`,
        msg: "L'articolo indeterminativo femminile 'una' si elide con apostrofo davanti a vocale ('un'').",
        ruleId: 'it_elision_fem'
      },
      {
        regex: /\b(un['’])(amico|uomo|albero|ufficio)\b/gi,
        replace: (m, p1, p2) => `un ${p2}`,
        msg: "L'articolo indeterminativo maschile 'un' si usa senza apostrofo davanti a vocale.",
        ruleId: 'it_elision_masc'
      },
      {
        regex: /\b(d[aà] accordo)\b/gi,
        replace: () => "d'accordo",
        msg: "La locuzione corretta si scrive con elisione: 'd'accordo'.",
        ruleId: 'it_daccordo'
      }
    ];

    for (const rule of rules) {
      let m;
      const re = new RegExp(rule.regex);
      while ((m = re.exec(text)) !== null) {
        const rangeKey = `${m.index}-${m.index + m[0].length}`;
        if (!detectedRanges.has(rangeKey)) {
          suggestions.push({
            start: m.index,
            end: m.index + m[0].length,
            original: m[0],
            replacement: rule.replace(m, m[1], m[2]),
            message: rule.msg,
            ruleId: rule.ruleId
          });
          detectedRanges.add(rangeKey);
        }
      }
    }
  }

  /**
   * Slovenian contextual syntax rules
   */
  runSlovenianRules(text, suggestions, detectedRanges) {
    // 1. Preposition rule "s / z":
    // "s" before unvoiced consonants: c, č, f, h, k, p, s, š, t ("Ta Suhi Škafec Pušča")
    // "z" elsewhere.
    const unvoicedConsonants = /^[cčfhkpsšt]/i;
    const sZRegex = /\b([szSZ])\s+([a-zA-ZčšžČŠŽ]+)\b/gu;
    let match;

    while ((match = sZRegex.exec(text)) !== null) {
      const prep = match[1];
      const nextWord = match[2];
      const isUpper = prep === prep.toUpperCase();
      const requiresS = unvoicedConsonants.test(nextWord);

      if (requiresS && prep.toLowerCase() === 'z') {
        const rangeKey = `${match.index}-${match.index + match[0].length}`;
        suggestions.push({
          start: match.index,
          end: match.index + match[0].length,
          original: match[0],
          replacement: `${isUpper ? 'S' : 's'} ${nextWord}`,
          message: `Predlog 's' se piše pred nezvenečimi nezvočniki (c, č, f, h, k, p, s, š, t - 'Ta suhi škafec pušča').`,
          ruleId: 'sl_preposition_sz'
        });
        detectedRanges.add(rangeKey);
      } else if (!requiresS && prep.toLowerCase() === 's') {
        const rangeKey = `${match.index}-${match.index + match[0].length}`;
        suggestions.push({
          start: match.index,
          end: match.index + match[0].length,
          original: match[0],
          replacement: `${isUpper ? 'Z' : 'z'} ${nextWord}`,
          message: `Predlog 'z' se piše pred vsemi ostalimi glasovi (samoglasniki in zvenečimi glasovi).`,
          ruleId: 'sl_preposition_sz'
        });
        detectedRanges.add(rangeKey);
      }
    }

    // 2. Preposition rule "k / h":
    // "h" before k, g; "k" elsewhere.
    const kHRegex = /\b([khKH])\s+([a-zA-ZčšžČŠŽ]+)\b/gu;
    while ((match = kHRegex.exec(text)) !== null) {
      const prep = match[1];
      const nextWord = match[2];
      const isUpper = prep === prep.toUpperCase();
      const requiresH = /^[kgKG]/.test(nextWord);

      if (requiresH && prep.toLowerCase() === 'k') {
        const rangeKey = `${match.index}-${match.index + match[0].length}`;
        suggestions.push({
          start: match.index,
          end: match.index + match[0].length,
          original: match[0],
          replacement: `${isUpper ? 'H' : 'h'} ${nextWord}`,
          message: `Predlog 'h' se uporablja pred besedami, ki se začnejo s črkama k ali g.`,
          ruleId: 'sl_preposition_kh'
        });
        detectedRanges.add(rangeKey);
      } else if (!requiresH && prep.toLowerCase() === 'h') {
        const rangeKey = `${match.index}-${match.index + match[0].length}`;
        suggestions.push({
          start: match.index,
          end: match.index + match[0].length,
          original: match[0],
          replacement: `${isUpper ? 'K' : 'k'} ${nextWord}`,
          message: `Predlog 'k' se uporablja pred vsemi črkami razen k in g.`,
          ruleId: 'sl_preposition_kh'
        });
        detectedRanges.add(rangeKey);
      }
    }

    // 3. Comma before conjunctions: "ki, ko, ker, da, če"
    const conjunctionRegex = /([a-zA-ZčšžČŠŽ0-9])\s+(ki|ko|ker|da|če)\b/gu;
    while ((match = conjunctionRegex.exec(text)) !== null) {
      const prevChar = match[1];
      const conj = match[2];
      const rangeKey = `${match.index}-${match.index + match[0].length}`;
      if (!detectedRanges.has(rangeKey)) {
        suggestions.push({
          start: match.index,
          end: match.index + match[0].length,
          original: match[0],
          replacement: `${prevChar}, ${conj}`,
          message: `Pred veznikom '${conj}' stoji vejica.`,
          ruleId: 'sl_comma_conjunction'
        });
        detectedRanges.add(rangeKey);
      }
    }
  }
}
