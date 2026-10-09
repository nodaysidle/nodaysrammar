/**
 * content/content-script.js
 * Content script for nodaysrammar.
 * Detects editable fields, debounces user input, queries the background worker,
 * and coordinates overlay rendering and inline text replacement.
 */

// --- FIELD DETECTION UTILITY ---
class FieldDetector {
  static getEditableElement(el) {
    if (!el || !(el instanceof HTMLElement)) return null;
    if (el.tagName === 'TEXTAREA') return el;
    if (el.tagName === 'INPUT') {
      const type = (el.type || el.getAttribute('type') || 'text').toLowerCase();
      if (['text', 'search', 'email', 'url', ''].includes(type)) return el;
      return null;
    }
    if (el.isContentEditable) {
      return el.closest('[contenteditable="true"], [contenteditable=""]') || el;
    }
    return null;
  }

  static isEditable(el) {
    return !!FieldDetector.getEditableElement(el);
  }

  static getText(el) {
    const target = FieldDetector.getEditableElement(el);
    if (!target) return '';
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      return target.value || '';
    }
    if (target.isContentEditable) {
      return target.innerText || target.textContent || '';
    }
    return '';
  }

  static replaceText(el, start, end, replacement) {
    if (!el) return false;

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      el.focus();
      if (typeof el.setRangeText === 'function') {
        el.setRangeText(replacement, start, end, 'end');
      } else {
        const val = el.value;
        el.value = val.substring(0, start) + replacement + val.substring(end);
      }
      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      return true;
    }

    if (el.isContentEditable) {
      el.focus();
      const range = FieldDetector.createRangeForTextOffsets(el, start, end);
      if (range) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        const execSuccess = document.execCommand('insertText', false, replacement);
        if (!execSuccess) {
          range.deleteContents();
          range.insertNode(document.createTextNode(replacement));
        }

        el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: replacement }));
        return true;
      }
    }
    return false;
  }

  static createRangeForTextOffsets(root, startOffset, endOffset) {
    let currentOffset = 0;
    let startNode = null;
    let startPos = 0;
    let endNode = null;
    let endPos = 0;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node;

    while ((node = walker.nextNode())) {
      const len = node.nodeValue.length;
      if (!startNode && currentOffset + len >= startOffset) {
        startNode = node;
        startPos = startOffset - currentOffset;
      }
      if (!endNode && currentOffset + len >= endOffset) {
        endNode = node;
        endPos = endOffset - currentOffset;
        break;
      }
      currentOffset += len;
    }

    if (startNode && endNode) {
      const range = document.createRange();
      range.setStart(startNode, Math.min(startPos, startNode.nodeValue.length));
      range.setEnd(endNode, Math.min(endPos, endNode.nodeValue.length));
      return range;
    }
    return null;
  }
}

// --- ISOLATED SHADOW DOM OVERLAY MANAGER ---
class OverlayManager {
  constructor() {
    this.hostElement = null;
    this.shadowRoot = null;
    this.activeElement = null;
    this.currentSuggestions = [];
    this.badgeElement = null;
    this.popoverElement = null;
    this.onAcceptCallback = null;

    this.initShadowHost();
    this.bindWindowEvents();
  }

  initShadowHost() {
    let host = document.getElementById('nodaysrammar-root');
    if (!host) {
      host = document.createElement('div');
      host.id = 'nodaysrammar-root';
      host.style.all = 'initial';
      host.style.position = 'fixed';
      host.style.top = '0';
      host.style.left = '0';
      host.style.zIndex = '2147483647';
      host.style.pointerEvents = 'none';
      (document.body || document.documentElement).appendChild(host);
    }
    this.hostElement = host;
    this.shadowRoot = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      * {
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px;
      }
      .badge {
        position: fixed;
        pointer-events: auto;
        cursor: pointer;
        background: #1890ff;
        color: #ffffff;
        font-weight: 600;
        border-radius: 12px;
        padding: 2px 7px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
        display: flex;
        align-items: center;
        gap: 4px;
        transition: transform 0.15s ease, background 0.15s ease;
        user-select: none;
      }
      .badge:hover {
        background: #096dd9;
        transform: scale(1.05);
      }
      .badge.has-errors {
        background: #ff4d4f;
      }
      .badge.has-errors:hover {
        background: #d9363e;
      }
      .popover {
        position: fixed;
        pointer-events: auto;
        background: #ffffff;
        color: #1f1f1f;
        border-radius: 8px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.15);
        border: 1px solid #f0f0f0;
        width: 310px;
        max-width: calc(100vw - 24px);
        max-height: calc(100vh - 24px);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        animation: fadeIn 0.15s ease-out;
        z-index: 2147483647;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .popover-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #f0f0f0;
        padding-bottom: 6px;
      }
      .popover-title {
        font-weight: 700;
        color: #262626;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .popover-close {
        cursor: pointer;
        color: #8c8c8c;
        font-size: 16px;
        border: none;
        background: none;
        padding: 0 4px;
        line-height: 1;
      }
      .popover-close:hover {
        color: #262626;
      }
      .suggestion-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 280px;
        overflow-y: auto;
      }
      .suggestion-item {
        background: #fafafa;
        border-radius: 6px;
        padding: 8px;
        border-left: 3px solid #ff4d4f;
      }
      .suggestion-msg {
        color: #595959;
        font-size: 12px;
        margin-bottom: 6px;
      }
      .suggestion-diff {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 8px;
      }
      .diff-original {
        color: #ff4d4f;
        text-decoration: line-through;
        background: #fff1f0;
        padding: 2px 4px;
        border-radius: 3px;
      }
      .diff-arrow {
        color: #8c8c8c;
      }
      .diff-replacement {
        color: #52c41a;
        font-weight: 600;
        background: #f6ffed;
        padding: 2px 4px;
        border-radius: 3px;
      }
      .action-row {
        display: flex;
        justify-content: flex-end;
        gap: 6px;
      }
      .btn {
        border: none;
        border-radius: 4px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .btn-accept {
        background: #52c41a;
        color: #ffffff;
      }
      .btn-accept:hover {
        background: #389e0d;
      }
      .btn-dismiss {
        background: #f0f0f0;
        color: #595959;
      }
      .btn-dismiss:hover {
        background: #d9d9d9;
      }
      .btn-fix-all {
        background: #2563eb;
        color: #ffffff;
        padding: 3px 8px;
        font-size: 11px;
        border-radius: 4px;
        font-weight: 600;
        cursor: pointer;
        border: none;
      }
      .btn-fix-all:hover {
        background: #1d4ed8;
      }
    `;
    this.shadowRoot.appendChild(style);
  }

  bindWindowEvents() {
    window.addEventListener('scroll', () => this.reposition(), { passive: true });
    window.addEventListener('resize', () => this.reposition(), { passive: true });
    document.addEventListener('pointerdown', (e) => {
      if (!this.popoverElement) return;
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      if (!path.includes(this.popoverElement) && !path.includes(this.badgeElement)) {
        // Clicking the active field: close popover but let the field keep/receive focus
        const clickedActive = this.activeElement && path.includes(this.activeElement);
        this.closePopover({ restoreFocus: !clickedActive });
      }
    }, true);
  }

  /**
   * Close the suggestion popover and optionally restore focus/caret to the active field.
   * Prevents the textarea from "ignoring" keystrokes after the card closes.
   */
  closePopover({ restoreFocus = true } = {}) {
    if (this.popoverElement) {
      this.popoverElement.remove();
      this.popoverElement = null;
    }
    if (restoreFocus && this.activeElement && this.activeElement.isConnected) {
      const el = this.activeElement;
      // Defer so we run after the click that dismissed the popover settles
      setTimeout(() => {
        try {
          el.focus({ preventScroll: true });
          if (typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
            const pos = el.selectionEnd;
            el.setSelectionRange(pos, pos);
          }
        } catch {
          // contenteditable / restricted fields
          try { el.focus(); } catch { /* ignore */ }
        }
      }, 0);
    }
  }

  setOnAccept(cb) {
    this.onAcceptCallback = cb;
  }

  setOnRecheck(cb) {
    this.onRecheckCallback = cb;
  }

  render(el, suggestions = [], meta = {}) {
    this.activeElement = el;
    this.currentSuggestions = suggestions;
    this.currentMeta = meta;
    this.reposition();
  }

  clear() {
    if (this.badgeElement) {
      this.badgeElement.remove();
      this.badgeElement = null;
    }
    if (this.popoverElement) {
      this.popoverElement.remove();
      this.popoverElement = null;
    }
    this.currentSuggestions = [];
  }

  reposition() {
    if (!this.activeElement || !this.activeElement.isConnected) {
      this.clear();
      return;
    }

    const rect = this.activeElement.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      this.clear();
      return;
    }

    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    if (!this.badgeElement) {
      this.badgeElement = document.createElement('div');
      this.badgeElement.className = 'badge';
      this.badgeElement.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePopover();
      });
      this.shadowRoot.appendChild(this.badgeElement);
    }

    const errCount = this.currentSuggestions.length;
    const langCode = (this.currentMeta?.language || 'en').toUpperCase();

    if (errCount > 0) {
      this.badgeElement.className = 'badge has-errors';
      this.badgeElement.innerHTML = `<span>⚡</span> <span>${errCount}</span> <span style="font-size: 10px; opacity: 0.85; margin-left: 1px;">${langCode}</span>`;
      this.badgeElement.title = `${errCount} suggestion(s) [${langCode}]. Click to review.`;
    } else {
      this.badgeElement.className = 'badge';
      this.badgeElement.innerHTML = `<span>✓</span> <span style="font-size: 10px; opacity: 0.85; margin-left: 2px;">${langCode}</span>`;
      this.badgeElement.title = `No grammar errors detected [${langCode}]. Click to change language.`;
    }

    // Position badge in bottom-right corner of field using viewport coordinates
    const badgeTop = rect.bottom - 26;
    const badgeLeft = rect.right - 58;
    this.badgeElement.style.top = `${Math.max(4, Math.min(window.innerHeight - 30, badgeTop))}px`;
    this.badgeElement.style.left = `${Math.max(4, Math.min(window.innerWidth - 65, badgeLeft))}px`;

    if (this.popoverElement) {
      // Dynamic auto-flip upward positioning when field is near bottom of viewport
      const popoverHeight = this.popoverElement.offsetHeight || 280;
      const popoverWidth = this.popoverElement.offsetWidth || 310;

      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      let popoverTop;
      // If there isn't enough vertical space below, or if space above is significantly larger, flip ABOVE the field
      if (spaceBelow < (popoverHeight + 16) && spaceAbove > spaceBelow) {
        popoverTop = rect.top - popoverHeight - 8;
      } else {
        popoverTop = rect.bottom + 8;
      }

      // Safety clamp: keep popover strictly inside viewport (8px padding from top & bottom)
      popoverTop = Math.max(8, Math.min(window.innerHeight - popoverHeight - 8, popoverTop));

      // Horizontal positioning: align to right side (near badge) for wide fields, or left for narrow fields
      let popoverLeft = (rect.width > 450)
        ? (rect.right - popoverWidth - 8)
        : rect.left;

      popoverLeft = Math.max(8, Math.min(window.innerWidth - popoverWidth - 8, popoverLeft));

      this.popoverElement.style.top = `${Math.round(popoverTop)}px`;
      this.popoverElement.style.left = `${Math.round(popoverLeft)}px`;
    }
  }

  togglePopover() {
    if (this.popoverElement) {
      this.closePopover({ restoreFocus: true });
      return;
    }

    const popover = document.createElement('div');
    popover.className = 'popover';

    const langCode = (this.currentMeta?.language || 'en').toUpperCase();
    const detectedCode = (this.currentMeta?.detectedLanguage || 'en').toUpperCase();

    // IF 0 SUGGESTIONS: Render clean status & language switcher card
    if (this.currentSuggestions.length === 0) {
      popover.innerHTML = `
        <div class="popover-header">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="color: #52c41a; font-weight: bold; font-size: 14px;">✓</span>
            <span class="popover-title">nodaysrammar • No errors</span>
          </div>
          <button class="popover-close" title="Close">&times;</button>
        </div>
        <div style="font-size: 12px; color: #595959; line-height: 1.5;">
          No grammar or spelling errors detected for <strong>${langCode}</strong>.
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px; background: #fafafa; padding: 8px 10px; border-radius: 6px; border: 1px solid #f0f0f0;">
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #8c8c8c;">
            <span>Detected Language:</span>
            <strong style="color: #262626;">${detectedCode}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
            <span style="color: #262626; font-weight: 500;">Active Check:</span>
            <select class="popover-lang-select" style="font-size: 12px; padding: 3px 6px; border-radius: 4px; border: 1px solid #d9d9d9; background: #fff; cursor: pointer; outline: none;">
              <option value="auto">🌐 Auto-detect</option>
              <option value="en">🇬🇧 English</option>
              <option value="it">🇮🇹 Italian</option>
              <option value="sl">🇸🇮 Slovenian</option>
            </select>
          </div>
        </div>
      `;

      popover.querySelector('.popover-close').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closePopover({ restoreFocus: true });
      });

      const select = popover.querySelector('.popover-lang-select');
      chrome.storage.sync.get(['language']).then(({ language }) => {
        if (language) select.value = language;
      });
      select.addEventListener('change', async () => {
        await chrome.storage.sync.set({ language: select.value });
        if (typeof this.onRecheckCallback === 'function') {
          this.onRecheckCallback();
        }
      });

      this.shadowRoot.appendChild(popover);
      this.popoverElement = popover;
      this.reposition();
      return;
    }

    const header = document.createElement('div');
    header.className = 'popover-header';
    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 6px;">
        <span class="popover-title">nodaysrammar (${this.currentSuggestions.length})</span>
        <span style="font-size: 10px; background: #e6f7ff; color: #1890ff; padding: 1px 5px; border-radius: 3px; font-weight: 600;">${langCode}</span>
      </div>
      <div style="display: flex; gap: 6px; align-items: center;">
        <button class="btn btn-fix-all" title="Fix all mistakes in one click">Fix All</button>
        <button class="popover-close" title="Close">&times;</button>
      </div>
    `;
    header.querySelector('.popover-close').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.closePopover({ restoreFocus: true });
    });
    header.querySelector('.btn-fix-all').addEventListener('click', (e) => {
      e.stopPropagation();
      this.applyAllCorrections();
    });
    popover.appendChild(header);

    const list = document.createElement('div');
    list.className = 'suggestion-list';

    this.currentSuggestions.forEach((sug, idx) => {
      const card = document.createElement('div');
      card.className = 'suggestion-item';
      card.innerHTML = `
        <div class="suggestion-msg">${sug.message}</div>
        <div class="suggestion-diff">
          <span class="diff-original">${sug.original}</span>
          <span class="diff-arrow">→</span>
          <span class="diff-replacement">${sug.replacement}</span>
        </div>
        <div class="action-row">
          <button class="btn btn-dismiss">Ignore</button>
          <button class="btn btn-accept">Accept</button>
        </div>
      `;

      card.querySelector('.btn-accept').addEventListener('click', (e) => {
        e.stopPropagation();
        this.applyCorrection(sug, idx);
      });

      card.querySelector('.btn-dismiss').addEventListener('click', (e) => {
        e.stopPropagation();
        this.currentSuggestions.splice(idx, 1);
        card.remove();
        this.reposition();
        if (this.currentSuggestions.length === 0) {
          this.closePopover({ restoreFocus: true });
        }
      });

      list.appendChild(card);
    });

    popover.appendChild(list);
    this.shadowRoot.appendChild(popover);
    this.popoverElement = popover;
    this.reposition();
  }

  applyCorrection(sug, idx) {
    if (!this.activeElement) return;

    const success = FieldDetector.replaceText(
      this.activeElement,
      sug.start,
      sug.end,
      sug.replacement
    );

    if (success) {
      if (typeof this.onAcceptCallback === 'function') {
        this.onAcceptCallback(sug);
      }
      this.currentSuggestions.splice(idx, 1);
      this.closePopover({ restoreFocus: true });
      this.reposition();
    }
  }

  applyAllCorrections() {
    if (!this.activeElement || this.currentSuggestions.length === 0) return;
    // Sort descending by start offset so replacing earlier text doesn't drift subsequent offsets
    const sorted = [...this.currentSuggestions].sort((a, b) => b.start - a.start);
    for (const sug of sorted) {
      FieldDetector.replaceText(this.activeElement, sug.start, sug.end, sug.replacement);
    }
    this.currentSuggestions = [];
    this.closePopover({ restoreFocus: true });
    this.reposition();
    if (typeof this.onAcceptCallback === 'function') {
      this.onAcceptCallback();
    }
  }
}

// --- CONTENT SCRIPT ORCHESTRATION ---
(function initNodaysrammar() {
  const overlayManager = new OverlayManager();
  let debounceTimer = null;
  const DEBOUNCE_DELAY_MS = 350;
  let currentTarget = null;
  let listenersAttached = false;
  let blockedDomains = ['bank', 'paypal.com'];

  function isCurrentDomainBlocked(domains = blockedDomains) {
    const hostname = window.location.hostname.toLowerCase();
    if (!hostname) return false;
    return (domains || []).some((d) => hostname.includes(String(d).toLowerCase()));
  }

  function clearActiveOverlays() {
    clearTimeout(debounceTimer);
    currentTarget = null;
    if (typeof overlayManager.destroy === 'function') {
      overlayManager.destroy();
    } else if (overlayManager.rootHost) {
      overlayManager.rootHost.remove();
      overlayManager.rootHost = null;
      overlayManager.shadowRoot = null;
      overlayManager.badgeElement = null;
      overlayManager.popoverElement = null;
      overlayManager.highlightLayer = null;
      overlayManager.activeElement = null;
      overlayManager.currentSuggestions = [];
    }
  }

  /**
   * Requests grammar analysis from background service worker
   */
  async function triggerGrammarCheck(element) {
    if (!listenersAttached) return;
    if (!element || !FieldDetector.isEditable(element)) return;

    const text = FieldDetector.getText(element);
    if (!text || text.trim().length === 0) {
      overlayManager.render(element, []);
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHECK_GRAMMAR',
        payload: {
          text,
          url: window.location.href
        }
      });

      if (response && (response.blocked || response.disabled)) {
        clearActiveOverlays();
        return;
      }

      if (response && response.success && Array.isArray(response.suggestions)) {
        overlayManager.render(element, response.suggestions, {
          language: response.language,
          detectedLanguage: response.detectedLanguage,
          confidence: response.confidence
        });
      }
    } catch (err) {
      // Background worker might be waking up or extension reloaded
      console.debug('[nodaysrammar] Background connection notice:', err.message);
    }
  }

  /**
   * Debounced input event listener
   */
  function handleInput(e) {
    const target = FieldDetector.getEditableElement(e.target);
    if (!target) return;

    currentTarget = target;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      triggerGrammarCheck(target);
    }, DEBOUNCE_DELAY_MS);
  }

  /**
   * Focus / Click listener to attach overlay
   */
  function handleFocus(e) {
    const target = FieldDetector.getEditableElement(e.target);
    if (!target) return;

    currentTarget = target;
    triggerGrammarCheck(target);
  }

  /**
   * Blur listener (delay to allow click on popover/badge)
   */
  function handleBlur() {
    setTimeout(() => {
      // Keep badge visible if currentTarget is still active or has errors
    }, 200);
  }

  // When suggestion is accepted, re-evaluate field
  overlayManager.setOnAccept(() => {
    if (currentTarget) {
      setTimeout(() => triggerGrammarCheck(currentTarget), 100);
    }
  });

  // When language is changed via popover, re-evaluate field immediately
  overlayManager.setOnRecheck(() => {
    if (currentTarget) {
      triggerGrammarCheck(currentTarget);
    }
  });

  /**
   * Auto-fix on Spacebar / Enter:
   * When autoFix is enabled, automatically corrects the word just finished.
   */
  async function handleKeydown(e) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const target = FieldDetector.getEditableElement(e.target);
    if (!target) return;

    try {
      const { autoFix } = await chrome.storage.sync.get(['autoFix']);
      if (!autoFix) return;

      if (overlayManager.currentSuggestions.length > 0) {
        const text = FieldDetector.getText(target);
        const caret = target.selectionStart ?? text.length;

        // Find suggestion ending right at or adjacent to caret
        const matchIdx = overlayManager.currentSuggestions.findIndex(
          (s) => Math.abs(s.end - caret) <= 1
        );

        if (matchIdx !== -1) {
          const sug = overlayManager.currentSuggestions[matchIdx];
          overlayManager.applyCorrection(sug, matchIdx);
        }
      }
    } catch {
      // Ignore storage read error
    }
  }

  function attachListeners() {
    if (listenersAttached) return;
    document.addEventListener('input', handleInput, true);
    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('focus', handleFocus, true);
    document.addEventListener('click', handleFocus, true);
    document.addEventListener('blur', handleBlur, true);
    listenersAttached = true;
    console.info('[nodaysrammar] Content script listeners attached on:', window.location.hostname);
  }

  function detachListeners() {
    if (!listenersAttached) return;
    document.removeEventListener('input', handleInput, true);
    document.removeEventListener('keydown', handleKeydown, true);
    document.removeEventListener('focus', handleFocus, true);
    document.removeEventListener('click', handleFocus, true);
    document.removeEventListener('blur', handleBlur, true);
    listenersAttached = false;
    clearActiveOverlays();
    console.info('[nodaysrammar] Content script listeners detached (blocklisted):', window.location.hostname);
  }

  function applyBlocklistState(domains) {
    blockedDomains = Array.isArray(domains) ? domains : blockedDomains;
    if (isCurrentDomainBlocked(blockedDomains)) {
      detachListeners();
    } else {
      attachListeners();
    }
  }

  chrome.storage.sync.get(['blockedDomains'], (result) => {
    applyBlocklistState(result.blockedDomains || blockedDomains);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.blockedDomains) return;
    applyBlocklistState(changes.blockedDomains.newValue || []);
  });
})();
