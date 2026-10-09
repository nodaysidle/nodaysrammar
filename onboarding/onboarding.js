/**
 * onboarding/onboarding.js
 * Onboarding interaction controller.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const radioButtons = document.querySelectorAll('input[name="default-lang"]');
  const btnFinish = document.getElementById('btn-save-finish');
  const demoTextarea = document.getElementById('demo-textarea');

  // Load existing preference
  const { language } = await chrome.storage.sync.get(['language']);
  if (language) {
    const radio = document.querySelector(`input[name="default-lang"][value="${language}"]`);
    if (radio) radio.checked = true;
  }

  // Handle language selection change
  radioButtons.forEach((radio) => {
    radio.addEventListener('change', async () => {
      await chrome.storage.sync.set({ language: radio.value });
    });
  });

  // Finish button
  btnFinish.addEventListener('click', async () => {
    const selected = document.querySelector('input[name="default-lang"]:checked')?.value || 'auto';
    await chrome.storage.sync.set({ language: selected });
    alert('Preferences saved! You can now start typing on any webpage with nodaysrammar.');
    window.close();
  });
});
