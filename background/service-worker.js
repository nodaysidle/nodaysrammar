/**
 * background/service-worker.js
 * Manifest V3 Background Service Worker for nodaysrammar.
 * Coordinates on-device model loading, language detection, and message routing.
 */

import { LanguageDetector } from './language-detector.js';
import { ModelLoader, ModelStatus } from './model-loader.js';
import { InferenceEngine } from './inference-engine.js';

// Initialize services
const languageDetector = new LanguageDetector();
const modelLoader = new ModelLoader();
const inferenceEngine = new InferenceEngine(modelLoader);

// Default configuration settings
const DEFAULT_SETTINGS = {
  enabled: true,
  autoFix: false, // Spacebar auto-correction mode
  language: 'auto', // 'auto' | 'en' | 'it' | 'sl'
  blockedDomains: ['bank', 'paypal.com'],
  underlineColor: '#ff4d4f'
};

/**
 * Handle Extension Installation and Lifecycle
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.info(`[nodaysrammar] Extension installed/updated. Reason: ${details.reason}`);

  // Initialize persistent default settings if unset
  const stored = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const toSet = {};
  for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
    if (stored[key] === undefined) {
      toSet[key] = val;
    }
  }
  if (Object.keys(toSet).length > 0) {
    await chrome.storage.sync.set(toSet);
  }

  // Pre-warm all local language models in parallel on install/update
  modelLoader.loadAllModels().catch((err) => {
    console.warn('[nodaysrammar] Initial background prewarm caught:', err);
  });

  // Open Onboarding page on fresh install
  if (details.reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('onboarding/onboarding.html')
    });
  }
});

// Pre-warm active model on browser/service worker startup
chrome.runtime.onStartup.addListener(async () => {
  const { language } = await chrome.storage.sync.get(['language']);
  if (language && language !== 'auto') {
    modelLoader.loadModel(language);
  } else {
    modelLoader.loadAllModels();
  }
});

// Watch for setting changes to proactively warm newly selected languages
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.language) {
    const newLang = changes.language.newValue;
    if (newLang && newLang !== 'auto' && ['en', 'it', 'sl'].includes(newLang)) {
      modelLoader.loadModel(newLang);
    }
  }
});

/**
 * Check if the given URL host is blocked by user preferences
 * @param {string} url
 * @param {Array<string>} blockedDomains
 * @returns {boolean}
 */
function isDomainBlocked(url, blockedDomains = []) {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return blockedDomains.some((d) => hostname.includes(d.toLowerCase()));
  } catch {
    return false;
  }
}

/**
 * Message Passing Router
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case 'CHECK_GRAMMAR': {
      handleCheckGrammar(payload, sender)
        .then(sendResponse)
        .catch((error) => {
          console.error('[nodaysrammar] Grammar check error:', error);
          sendResponse({
            success: false,
            error: error.message || 'Grammar inference failed',
            suggestions: []
          });
        });
      return true; // Keep message channel open for async response
    }

    case 'GET_STATUS': {
      handleGetStatus()
        .then(sendResponse)
        .catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }

    case 'RELOAD_MODELS': {
      modelLoader.reset().then(async () => {
        await modelLoader.loadAllModels();
        sendResponse({ success: true, status: modelLoader.getStatus() });
      });
      return true;
    }

    case 'WARM_ALL_MODELS': {
      modelLoader.loadAllModels().then((status) => {
        sendResponse({ success: true, status });
      }).catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }

    case 'WARM_MODEL': {
      const targetLang = payload?.language;
      if (targetLang && ['en', 'it', 'sl'].includes(targetLang)) {
        modelLoader.loadModel(targetLang).then(() => {
          sendResponse({ success: true, status: modelLoader.getStatus() });
        });
        return true;
      }
      modelLoader.loadAllModels().then((status) => {
        sendResponse({ success: true, status });
      });
      return true;
    }

    case 'DETECT_LANGUAGE': {
      const { text, fallback } = payload || {};
      const result = languageDetector.detect(text, fallback || 'en');
      sendResponse({ success: true, ...result });
      return false;
    }

    default:
      sendResponse({ success: false, error: `Unknown message type: ${type}` });
      return false;
  }
});

/**
 * Handles text check request from content scripts
 */
async function handleCheckGrammar(payload, sender) {
  const { text, url } = payload;
  const settings = await chrome.storage.sync.get([
    'enabled',
    'language',
    'blockedDomains'
  ]);

  // 1. Check if disabled globally
  if (settings.enabled === false) {
    return { success: true, disabled: true, suggestions: [] };
  }

  // 2. Check if current domain is blocked
  const pageUrl = url || sender.tab?.url || '';
  if (isDomainBlocked(pageUrl, settings.blockedDomains)) {
    return { success: true, blocked: true, suggestions: [] };
  }

  // 3. Determine target language and run detection
  const detection = languageDetector.detect(text, 'en');
  let activeLang = settings.language;
  let usedFallback = false;

  if (!activeLang || activeLang === 'auto') {
    activeLang = detection.language;
  }

  // Validate supported language
  if (!['en', 'it', 'sl'].includes(activeLang)) {
    activeLang = 'en';
  }

  // 4. Run local on-device inference
  let suggestions = await inferenceEngine.analyze(text, activeLang);

  // Cross-lingual fallback:
  // If the user's selected language returned 0 suggestions, but text is detected as another language
  // with >= 0.55 confidence (e.g., user selected Slovenian, but wrote English text with errors),
  // automatically check with the detected language so obvious typos are caught!
  if (suggestions.length === 0 && detection.language !== activeLang && detection.confidence >= 0.55) {
    const detectedSuggestions = await inferenceEngine.analyze(text, detection.language);
    if (detectedSuggestions.length > 0) {
      suggestions = detectedSuggestions;
      activeLang = detection.language;
      usedFallback = true;
    }
  }

  console.info(`[nodaysrammar] Checked text (${text.length} chars) using ${activeLang.toUpperCase()}. Found ${suggestions.length} issues.`);

  return {
    success: true,
    language: activeLang,
    detectedLanguage: detection.language,
    confidence: detection.confidence,
    usedFallback,
    modelStatus: modelLoader.getStatus(activeLang).status,
    suggestions
  };
}

/**
 * Retrieves aggregate system status
 */
async function handleGetStatus() {
  const settings = await chrome.storage.sync.get(['enabled', 'language']);
  const modelStatus = modelLoader.getStatus();

  return {
    success: true,
    enabled: settings.enabled ?? true,
    selectedLanguage: settings.language || 'auto',
    modelStatus: modelStatus.status,
    errors: modelStatus.errors
  };
}
