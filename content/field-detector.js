/**
 * content/field-detector.js
 * Identifies, observes, and manipulates editable text fields across web pages.
 * Supports textarea, input[type=text|search|email], and contenteditable elements.
 */

export class FieldDetector {
  /**
   * Tests whether an element is an eligible editable field
   * @param {Element} el
   * @returns {boolean}
   */
  static isEditable(el) {
    if (!el || !(el instanceof HTMLElement)) return false;

    // Check contenteditable
    if (el.isContentEditable) return true;

    // Check textarea
    if (el.tagName === 'TEXTAREA') return true;

    // Check eligible input types
    if (el.tagName === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      const eligibleTypes = ['text', 'search', 'email', 'url'];
      return eligibleTypes.includes(type);
    }

    return false;
  }

  /**
   * Extracts clean text value from any editable element
   * @param {HTMLElement} el
   * @returns {string}
   */
  static getText(el) {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      return el.value || '';
    }
    if (el.isContentEditable) {
      return el.innerText || el.textContent || '';
    }
    return '';
  }

  /**
   * Safely replaces a substring range in an editable field without breaking framework state (React, Vue, etc.)
   * @param {HTMLElement} el - The target element
   * @param {number} start - Start character index
   * @param {number} end - End character index
   * @param {string} replacement - The new text
   * @returns {boolean}
   */
  static replaceText(el, start, end, replacement) {
    if (!el) return false;

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      el.focus();
      // Use standard HTMLInputElement.setRangeText
      if (typeof el.setRangeText === 'function') {
        el.setRangeText(replacement, start, end, 'end');
      } else {
        const val = el.value;
        el.value = val.substring(0, start) + replacement + val.substring(end);
      }

      // Dispatch native input & change events for React/Vue reactive bindings
      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      return true;
    }

    if (el.isContentEditable) {
      el.focus();
      // For contenteditable, find the text node and offset corresponding to start & end
      const range = FieldDetector.createRangeForTextOffsets(el, start, end);
      if (range) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        // Attempt execCommand first to preserve undo history in browser
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

  /**
   * Maps text offsets to a DOM Range inside a contenteditable container
   * @private
   */
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
