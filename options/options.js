/**
 * options/options.js
 * Options page controller for nodaysrammar.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const optEnabled = document.getElementById('opt-enabled');
  const optAutofix = document.getElementById('opt-autofix');
  const optLanguage = document.getElementById('opt-language');
  const domainInput = document.getElementById('domain-input');
  const btnAddDomain = document.getElementById('btn-add-domain');
  const domainList = document.getElementById('domain-list');
  const btnSave = document.getElementById('btn-save');
  const btnReset = document.getElementById('btn-reset-defaults');
  const btnReloadModels = document.getElementById('btn-reload-all-models');
  const toast = document.getElementById('toast');

  const statusBadges = {
    en: document.getElementById('model-status-en'),
    it: document.getElementById('model-status-it'),
    sl: document.getElementById('model-status-sl')
  };

  let blockedDomains = [];

  // 1. Load preferences
  const settings = await chrome.storage.sync.get(['enabled', 'language', 'blockedDomains', 'autoFix']);
  optEnabled.checked = settings.enabled ?? true;
  if (optAutofix) optAutofix.checked = settings.autoFix ?? false;
  optLanguage.value = settings.language || 'auto';
  blockedDomains = settings.blockedDomains || ['bank', 'paypal.com'];
  renderDomainList();

  // 2. Query model status and proactively warm uninitialized models
  async function updateModelStatuses() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      if (res && res.success && res.modelStatus) {
        let hasUninitialized = false;
        ['en', 'it', 'sl'].forEach((lang) => {
          const status = res.modelStatus[lang] || 'uninitialized';
          if (status === 'uninitialized') hasUninitialized = true;
          const badge = statusBadges[lang];
          if (!badge) return;

          badge.className = `badge ${status}`;
          badge.textContent = status.toUpperCase();
        });

        // If any model is not yet warmed, request background warming
        if (hasUninitialized) {
          chrome.runtime.sendMessage({ type: 'WARM_ALL_MODELS' }).then((warmRes) => {
            if (warmRes && warmRes.success && warmRes.status) {
              ['en', 'it', 'sl'].forEach((lang) => {
                const s = warmRes.status[lang] || 'ready';
                const badge = statusBadges[lang];
                if (badge) {
                  badge.className = `badge ${s}`;
                  badge.textContent = s.toUpperCase();
                }
              });
            }
          });
        }
      }
    } catch {
      ['en', 'it', 'sl'].forEach((lang) => {
        const badge = statusBadges[lang];
        if (badge) {
          badge.className = 'badge error';
          badge.textContent = 'OFFLINE';
        }
      });
    }
  }

  await updateModelStatuses();

  // Proactively warm newly selected language on dropdown change
  optLanguage.addEventListener('change', async () => {
    const selected = optLanguage.value;
    if (selected && selected !== 'auto') {
      const badge = statusBadges[selected];
      if (badge) {
        badge.className = 'badge loading';
        badge.textContent = 'LOADING...';
      }
      await chrome.runtime.sendMessage({
        type: 'WARM_MODEL',
        payload: { language: selected }
      });
      await updateModelStatuses();
    }
  });

  // 3. Render Domain Blocklist
  function renderDomainList() {
    domainList.innerHTML = '';
    blockedDomains.forEach((domain, idx) => {
      const li = document.createElement('li');
      li.className = 'tag-item';
      li.innerHTML = `
        <span>${domain}</span>
        <span class="tag-remove" data-idx="${idx}">&times;</span>
      `;
      li.querySelector('.tag-remove').addEventListener('click', () => {
        blockedDomains.splice(idx, 1);
        renderDomainList();
      });
      domainList.appendChild(li);
    });
  }

  // Add Domain
  btnAddDomain.addEventListener('click', () => {
    const val = domainInput.value.trim().toLowerCase();
    if (val && !blockedDomains.includes(val)) {
      blockedDomains.push(val);
      domainInput.value = '';
      renderDomainList();
    }
  });

  // Save Settings
  btnSave.addEventListener('click', async () => {
    const selectedLang = optLanguage.value;
    await chrome.storage.sync.set({
      enabled: optEnabled.checked,
      autoFix: optAutofix ? optAutofix.checked : false,
      language: selectedLang,
      blockedDomains
    });
    if (selectedLang !== 'auto') {
      await chrome.runtime.sendMessage({
        type: 'WARM_MODEL',
        payload: { language: selectedLang }
      });
      await updateModelStatuses();
    }
    showToast('Settings saved successfully!');
  });

  // Reset to Defaults
  btnReset.addEventListener('click', async () => {
    if (confirm('Reset all nodaysrammar settings to factory defaults?')) {
      const defaults = {
        enabled: true,
        autoFix: false,
        language: 'auto',
        blockedDomains: ['bank', 'paypal.com']
      };
      await chrome.storage.sync.set(defaults);
      optEnabled.checked = defaults.enabled;
      if (optAutofix) optAutofix.checked = false;
      optLanguage.value = defaults.language;
      blockedDomains = [...defaults.blockedDomains];
      renderDomainList();
      showToast('Settings reset to defaults.');
    }
  });

  // Reload Models
  btnReloadModels.addEventListener('click', async () => {
    btnReloadModels.disabled = true;
    showToast('Reloading on-device models...');
    try {
      await chrome.runtime.sendMessage({ type: 'RELOAD_MODELS' });
      await updateModelStatuses();
    } finally {
      btnReloadModels.disabled = false;
    }
  });

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }
});
