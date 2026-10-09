/**
 * content/overlay-manager.js
 * Renders scoped Shadow DOM annotations and suggestion popovers.
 * Guarantees zero CSS leakage into the host document.
 */

import { FieldDetector } from './field-detector.js';

export class OverlayManager {
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

  /**
   * Creates isolated Shadow DOM container in document.body
   */
  initShadowHost() {
    let host = document.getElementById('nodaysrammar-root');
    if (!host) {
      host = document.createElement('div');
      host.id = 'nodaysrammar-root';
      host.style.all = 'initial';
      host.style.position = 'absolute';
      host.style.top = '0';
      host.style.left = '0';
      host.style.zIndex = '2147483647'; // Max z-index to stay above page layers
      host.style.pointerEvents = 'none';
      document.body.appendChild(host);
    }
    this.hostElement = host;
    this.shadowRoot = host.attachShadow({ mode: 'open' });

    // Inject isolated Shadow DOM styles
    const style = document.createElement('style');
    style.textContent = `
      * {
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px;
      }
      .badge {
        position: absolute;
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
        position: absolute;
        pointer-events: auto;
        background: #ffffff;
        color: #1f1f1f;
        border-radius: 8px;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15), 0 3px 6px rgba(0, 0, 0, 0.1);
        border: 1px solid #f0f0f0;
        width: 290px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        animation: fadeIn 0.15s ease-out;
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
        font-weight: 600;
        color: #262626;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .popover-close {
        cursor: pointer;
        color: #8c8c8c;
        font-size: 14px;
        border: none;
        background: none;
        padding: 0 4px;
      }
      .popover-close:hover {
        color: #262626;
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
        padding: 1px 4px;
        border-radius: 3px;
      }
      .diff-arrow {
        color: #8c8c8c;
      }
      .diff-replacement {
        color: #52c41a;
        font-weight: 600;
        background: #f6ffed;
        padding: 1px 4px;
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
    `;
    this.shadowRoot.appendChild(style);
  }

  /**
   * Listen to scroll and resize to keep overlays pinned to fields
   */
  bindWindowEvents() {
    window.addEventListener('scroll', () => this.reposition(), { passive: true });
    window.addEventListener('resize', () => this.reposition(), { passive: true });
  }

  /**
   * Sets callback invoked when a suggestion is accepted
   * @param {Function} cb
   */
  setOnAccept(cb) {
    this.onAcceptCallback = cb;
  }

  /**
   * Updates suggestions for the currently focused element
   * @param {HTMLElement} el
   * @param {Array} suggestions
   */
  render(el, suggestions = []) {
    this.activeElement = el;
    this.currentSuggestions = suggestions;
    this.reposition();
  }

  /**
   * Clear current overlays
   */
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

  /**
   * Reposition badge and popover according to active element's bounding rect
   */
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

    // Render / update badge at bottom-right corner of field
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
    if (errCount > 0) {
      this.badgeElement.className = 'badge has-errors';
      this.badgeElement.innerHTML = `<span>⚡</span> <span>${errCount}</span>`;
      this.badgeElement.title = `${errCount} suggestion(s) available. Click to review.`;
    } else {
      this.badgeElement.className = 'badge';
      this.badgeElement.innerHTML = `<span>✓</span>`;
      this.badgeElement.title = `No grammar errors detected.`;
    }

    // Position badge 6px inside bottom-right of field or just below if small
    const badgeTop = scrollY + rect.bottom - 26;
    const badgeLeft = scrollX + rect.right - 44;
    this.badgeElement.style.top = `${Math.max(scrollY, badgeTop)}px`;
    this.badgeElement.style.left = `${Math.max(scrollX, badgeLeft)}px`;

    // Reposition popover if currently open
    if (this.popoverElement) {
      const popoverTop = scrollY + rect.bottom + 4;
      const popoverLeft = Math.min(scrollX + rect.left, scrollX + window.innerWidth - 310);
      this.popoverElement.style.top = `${popoverTop}px`;
      this.popoverElement.style.left = `${Math.max(scrollX + 8, popoverLeft)}px`;
    }
  }

  /**
   * Toggles the suggestion cards popover
   */
  togglePopover() {
    if (this.popoverElement) {
      this.popoverElement.remove();
      this.popoverElement = null;
      return;
    }

    if (this.currentSuggestions.length === 0) return;

    const popover = document.createElement('div');
    popover.className = 'popover';

    const header = document.createElement('div');
    header.className = 'popover-header';
    header.innerHTML = `
      <span class="popover-title">nodaysrammar (${this.currentSuggestions.length})</span>
      <button class="popover-close" title="Close">&times;</button>
    `;
    header.querySelector('.popover-close').addEventListener('click', () => {
      this.popoverElement.remove();
      this.popoverElement = null;
    });
    popover.appendChild(header);

    // Render list of suggestions
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

      // Accept button action
      card.querySelector('.btn-accept').addEventListener('click', (e) => {
        e.stopPropagation();
        this.applyCorrection(sug, idx);
      });

      // Ignore button action
      card.querySelector('.btn-dismiss').addEventListener('click', (e) => {
        e.stopPropagation();
        this.currentSuggestions.splice(idx, 1);
        card.remove();
        this.reposition();
        if (this.currentSuggestions.length === 0 && this.popoverElement) {
          this.popoverElement.remove();
          this.popoverElement = null;
        }
      });

      popover.appendChild(card);
    });

    this.shadowRoot.appendChild(popover);
    this.popoverElement = popover;
    this.reposition();
  }

  /**
   * Applies the selected suggestion to the editable DOM element
   * @param {Object} sug
   * @param {number} idx
   */
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
      if (this.popoverElement) {
        this.popoverElement.remove();
        this.popoverElement = null;
      }
      this.reposition();
    }
  }
}
