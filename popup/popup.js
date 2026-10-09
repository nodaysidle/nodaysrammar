/**
 * popup/popup.js
 * Controller for nodaysrammar extension popup.
 * Interacts with chrome.storage and queries background worker status.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const toggleEnable = document.getElementById('toggle-enable');
  const toggleAutofix = document.getElementById('toggle-autofix');
  const langSelect = document.getElementById('language-select');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const statusSubtext = document.getElementById('status-subtext');
  const btnOptions = document.getElementById('btn-options');
  const btnReload = document.getElementById('btn-reload-model');

  // 1. Load initial user preferences
  const settings = await chrome.storage.sync.get(['enabled', 'language', 'autoFix']);
  toggleEnable.checked = settings.enabled ?? true;
  if (toggleAutofix) toggleAutofix.checked = settings.autoFix ?? false;
  langSelect.value = settings.language || 'auto';

  // 2. Fetch live model runtime status from background worker
  async function refreshStatus() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      if (!res || !res.success) {
        setStatusUI('error', 'Service unavailable', 'Background worker unresponsive');
        return;
      }

      if (!res.enabled) {
        setStatusUI('error', 'Disabled', 'Toggle switch above to enable');
        return;
      }

      const activeLang = res.selectedLanguage === 'auto' ? 'en' : res.selectedLanguage;
      const langStatus = res.modelStatus ? res.modelStatus[activeLang] : 'ready';

      if (langStatus === 'ready') {
        setStatusUI('ready', 'Engine Ready', `Active language: ${activeLang.toUpperCase()}`);
      } else if (langStatus === 'loading') {
        setStatusUI('loading', 'Loading Model...', 'Initializing on-device classifier');
      } else if (langStatus === 'error') {
        setStatusUI('error', 'Error Loading Model', res.errors?.[activeLang] || 'Check options');
      } else {
        setStatusUI('ready', 'Engine Ready', 'Local classifier + dictionary pipeline');
      }
    } catch (err) {
      setStatusUI('error', 'Disconnected', 'Extension background inactive');
    }
  }

  function setStatusUI(type, text, subtext) {
    statusDot.className = `status-indicator ${type}`;
    statusText.textContent = text;
    statusSubtext.textContent = subtext;
  }

  await refreshStatus();

  // 3. Toggle enabled state
  toggleEnable.addEventListener('change', async () => {
    const isEnabled = toggleEnable.checked;
    await chrome.storage.sync.set({ enabled: isEnabled });
    await refreshStatus();
  });

  // Toggle auto-fix state
  if (toggleAutofix) {
    toggleAutofix.addEventListener('change', async () => {
      await chrome.storage.sync.set({ autoFix: toggleAutofix.checked });
    });
  }

  // 4. Change language
  langSelect.addEventListener('change', async () => {
    const lang = langSelect.value;
    await chrome.storage.sync.set({ language: lang });
    setStatusUI('loading', 'Switching Language...', `Loading ${lang.toUpperCase()}`);
    if (lang !== 'auto') {
      await chrome.runtime.sendMessage({
        type: 'WARM_MODEL',
        payload: { language: lang }
      });
    } else {
      await chrome.runtime.sendMessage({ type: 'WARM_ALL_MODELS' });
    }
    await refreshStatus();
  });

  // 5. Reload engine button
  btnReload.addEventListener('click', async () => {
    btnReload.disabled = true;
    setStatusUI('loading', 'Reloading...', 'Purging cache and reloading models');
    try {
      await chrome.runtime.sendMessage({ type: 'RELOAD_MODELS' });
      await refreshStatus();
    } finally {
      btnReload.disabled = false;
    }
  });

  // 6. Options page
  btnOptions.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options/options.html'));
    }
  });
});
