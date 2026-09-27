import type { Muya } from '@markdown/muya-core';

/** Visual-only shortcuts; Muya remains responsible for selection and history. */
export class BlockSelectAll {
  static pluginName = 'blockSelectAll';

  constructor(muya: Muya) {
    muya.eventCenter.attachDOMEvent(muya.domNode, 'keydown', ((event: KeyboardEvent) => {
      const selectAll = event.key.toLowerCase() === 'a'
        && (event.ctrlKey || event.metaKey)
        && !event.altKey && !event.shiftKey;
      if ((!selectAll && event.key !== 'Control') || event.defaultPrevented || event.isComposing) return;

      const root = muya.domNode;
      const target = event.target;
      if (!(target instanceof Element) || !root.contains(target)) return;
      if (root.closest('[hidden], [aria-hidden="true"]') || getComputedStyle(root).display === 'none') return;
      // Native controls and independent editables must keep their own shortcuts,
      // even when the browser still has an old selection in the Visual editor.
      if (target.closest('input, textarea, select, button, [contenteditable="false"], .cm-editor')) return;
      const editable = target.closest('[contenteditable]');
      if (editable && editable !== root && !editable.classList.contains('mu-content')) return;

      const selection = muya.editor.selection;
      const current = selection.getSelection();
      if (!current
        || !root.contains(current.anchorBlock.domNode ?? null)
        || !root.contains(current.focusBlock.domNode ?? null)) return;

      if (event.key === 'Control') {
        // Upstream's cross-block clipboard key handler treats an unrecognized
        // modifier as replacement text. Do not let pressing Ctrl alone cut the
        // selection between the second and third Ctrl+A.
        if (!current.isSelectionInSameBlock) event.stopImmediatePropagation();
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      // selectAll uses Muya's cached cursor. Refresh it from the actual DOM range
      // on every invocation rather than tracking shortcut counts or timers.
      selection.setSelection(current);
      selection.selectAll();
    }) as EventListener, true);
  }
}
