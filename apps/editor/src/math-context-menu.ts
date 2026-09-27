import { BaseScrollFloat, BLOCK_DOM_PROPERTY, type Muya } from '@markdown/muya-core';
import {
  EDITOR_CONTENT_LOADED,
  MATH_TYPE_PREFERENCE_CHANGED,
} from './math-preferences.js';
import {
  findMathTemplates,
  listFeaturedMathTemplates,
  type MathTemplate,
} from './math-templates.js';
import {
  applyMathInsertion,
  findMathSlashTrigger,
  moveMathTabStop,
} from './math-insertion.js';

interface MathMenuItem {
  title: string;
  subTitle: string;
  label: string;
  icon: string;
}

interface MathContent {
  blockName: string;
  text: string;
  domNode: HTMLElement | null;
  outContainer?: { blockName: string } | null;
  getCursor(): { start: { offset: number }; end: { offset: number } } | null;
  updatePreviewIfHave(text: string): void;
  setCursor(begin: number, end: number, needUpdate?: boolean): void;
}

interface MathTabSession {
  block: MathContent;
  text: string;
  tabStops: Array<{ from: number; to: number }>;
  activeIndex: number;
}

/** Contextual slash insertion for the editable source inside a display-math block. */
export class MathContextMenu extends BaseScrollFloat {
  static pluginName = 'mathContextMenu';

  public block: MathContent | null = null;
  public activeItem: MathMenuItem | null = null;
  private items: MathMenuItem[] = [];
  private tabSession: MathTabSession | null = null;
  private mathTypeEnabled = false;
  private paletteFrame: number | null = null;
  private readonly paletteByBlock = new WeakMap<HTMLElement, HTMLElement>();

  constructor(muya: Muya) {
    super(muya, 'mu-math-quick-insert');
    this.listen();
    this.listenForMathInput();
    this.listenForMathTypePreference();
    this.render();
  }

  listen(): void {
    super.listen();
  }

  private listenForMathInput(): void {
    const { domNode, editor } = this.muya;
    const currentMathBlock = (): MathContent | null => {
      const selection = editor.selection.getSelection();
      const block = selection?.anchorBlock as unknown as MathContent | undefined;
      return block?.blockName === 'codeblock.content'
        && block.outContainer?.blockName === 'math-block'
        ? block
        : null;
    };
    const handleInput = (): void => {
      const block = currentMathBlock();
      if (!block) {
        this.tabSession = null;
        this.hide();
        return;
      }
      this.remapTabSession(block);
      const cursor = block.getCursor();
      if (!cursor) {
        this.hide();
        return;
      }
      if (cursor.start.offset !== cursor.end.offset) {
        this.hide();
        return;
      }
      const trigger = findMathSlashTrigger(block.text, cursor.end.offset);
      if (!trigger) {
        this.hide();
        return;
      }
      this.block = block;
      if (block.domNode) this.show(block.domNode);
      this.search(trigger.query);
    };
    const handleTab = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab' || event.defaultPrevented) return;
      const block = currentMathBlock();
      const session = this.tabSession;
      if (!block || !session || session.block !== block) return;
      this.remapTabSession(block);
      const next = moveMathTabStop(
        session.tabStops,
        session.activeIndex,
        event.shiftKey ? 'previous' : 'next',
      );
      if (!next) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      session.activeIndex = next.index;
      block.setCursor(next.tabStop.from, next.tabStop.to, true);
    };
    const { eventCenter } = this.muya;
    eventCenter.attachDOMEvent(domNode, 'input', handleInput);
    eventCenter.attachDOMEvent(domNode, 'compositionend', handleInput);
    eventCenter.attachDOMEvent(domNode, 'keydown', handleTab as EventListener, true);
    eventCenter.subscribe('selection-change', () => {
      const session = this.tabSession;
      if (!session) return;
      const selection = editor.selection.getSelection();
      const anchorBlock = selection?.anchorBlock as unknown;
      const focusBlock = selection?.focusBlock as unknown;
      if (anchorBlock !== session.block || focusBlock !== session.block) {
        this.tabSession = null;
      }
    });
    eventCenter.attachDOMEvent(domNode, EDITOR_CONTENT_LOADED, () => {
      this.tabSession = null;
      this.block = null;
    });
  }

  private listenForMathTypePreference(): void {
    const { domNode, eventCenter } = this.muya;
    const schedulePaletteReconcile = (): void => {
      if (this.paletteFrame !== null) cancelAnimationFrame(this.paletteFrame);
      this.paletteFrame = requestAnimationFrame(() => {
        this.paletteFrame = null;
        this.reconcilePalettes();
      });
    };
    eventCenter.attachDOMEvent(domNode, MATH_TYPE_PREFERENCE_CHANGED, ((event: CustomEvent) => {
      this.mathTypeEnabled = event.detail?.enabled === true;
      schedulePaletteReconcile();
    }) as EventListener);
    eventCenter.subscribe('json-change', schedulePaletteReconcile);
    eventCenter.attachDOMEvent(domNode, EDITOR_CONTENT_LOADED, schedulePaletteReconcile);
  }

  private reconcilePalettes(): void {
    if (!this.mathTypeEnabled) {
      for (const palette of this.muya.domNode.querySelectorAll('.mu-math-template-palette')) {
        palette.remove();
      }
      return;
    }
    for (const mathBlockElement of this.muya.domNode.querySelectorAll<HTMLElement>('.mu-math-block')) {
      const existing = this.paletteByBlock.get(mathBlockElement);
      if (existing?.isConnected) continue;
      const palette = document.createElement('div');
      palette.className = 'mu-math-template-palette';
      palette.setAttribute('role', 'toolbar');
      palette.setAttribute('aria-label', 'MathType formulas');
      for (const template of listFeaturedMathTemplates()) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.label = template.id;
        button.setAttribute('aria-label', `${template.title} — ${template.id}`);
        const icon = document.createElement('span');
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = template.icon;
        const label = document.createElement('span');
        label.textContent = template.title;
        button.append(icon, label);
        button.addEventListener('click', () => this.insertTemplateFromPalette(mathBlockElement, template));
        palette.append(button);
      }
      this.paletteByBlock.set(mathBlockElement, palette);
      mathBlockElement.prepend(palette);
    }
  }

  private insertTemplateFromPalette(mathBlockElement: HTMLElement, template: MathTemplate): void {
    const contentElement = mathBlockElement.querySelector<HTMLElement>('.mu-codeblock-content');
    const block = contentElement?.[BLOCK_DOM_PROPERTY as keyof HTMLElement] as unknown as MathContent | undefined;
    if (!block) return;
    const cursor = block.getCursor();
    const from = cursor?.start.offset ?? block.text.length;
    const to = cursor?.end.offset ?? from;
    const selectedText = from === to ? undefined : block.text.slice(from, to);
    const insertion = template.create(selectedText);
    const result = applyMathInsertion(block.text, from, to, insertion);
    block.text = result.text;
    block.updatePreviewIfHave(result.text);
    this.tabSession = result.tabStops.length > 0
      ? { block, text: result.text, tabStops: result.tabStops, activeIndex: 0 }
      : null;
    const active = result.activeTabStop;
    const fallback = from + insertion.text.length;
    block.setCursor(active?.from ?? fallback, active?.to ?? fallback, true);
  }

  search(query: string): void {
    this.items = findMathTemplates(query).map(toMenuItem);
    this.renderArray = this.items;
    this.activeItem = this.items[0] ?? null;
    this.render();
  }

  render(): void {
    if (!this.scrollElement) return;
    this.scrollElement.replaceChildren();
    this.scrollElement.setAttribute('role', 'listbox');
    this.scrollElement.setAttribute('aria-label', 'Math formula templates');
    const activeId = this.activeItem ? `math-template-option-${this.activeItem.label}` : null;
    if (activeId) this.scrollElement.setAttribute('aria-activedescendant', activeId);
    else this.scrollElement.removeAttribute('aria-activedescendant');
    const fragment = document.createDocumentFragment();
    for (const item of this.items) {
      const element = document.createElement('button');
      element.type = 'button';
      element.id = `math-template-option-${item.label}`;
      element.setAttribute('role', 'option');
      element.setAttribute('aria-selected', String(item === this.activeItem));
      element.className = item === this.activeItem ? 'item active' : 'item';
      element.dataset.label = item.label;
      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = item.icon;
      icon.setAttribute('aria-hidden', 'true');
      const description = document.createElement('span');
      description.className = 'description';
      const title = document.createElement('strong');
      title.textContent = item.title;
      const shortcut = document.createElement('small');
      shortcut.textContent = item.subTitle;
      description.append(title, shortcut);
      element.append(icon, description);
      element.addEventListener('click', () => this.selectItem(item));
      fragment.append(element);
    }
    if (this.items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'no-result';
      empty.textContent = this.muya.i18n.t('No result');
      fragment.append(empty);
    }
    this.scrollElement.append(fragment);
    requestAnimationFrame(() => {
      if (!this.container || !this.floatBox) return;
      this.floatBox.style.width = `${this.container.offsetWidth}px`;
      this.floatBox.style.height = `${this.container.offsetHeight}px`;
    });
  }

  selectItem(item: MathMenuItem): void {
    const block = this.block;
    const cursor = block?.getCursor();
    if (!block || !cursor) {
      this.hide();
      return;
    }
    if (cursor.start.offset !== cursor.end.offset) {
      this.hide();
      return;
    }
    const trigger = findMathSlashTrigger(block.text, cursor.end.offset);
    const template = findMathTemplates(item.label).find((candidate) => candidate.id === item.label);
    if (!trigger || !template) {
      this.hide();
      return;
    }
    const selectedText = cursor.start.offset === cursor.end.offset
      ? undefined
      : block.text.slice(cursor.start.offset, cursor.end.offset);
    const insertion = template.create(selectedText);
    const result = applyMathInsertion(block.text, trigger.from, trigger.to, insertion);
    block.text = result.text;
    block.updatePreviewIfHave(result.text);
    const active = result.activeTabStop;
    this.tabSession = result.tabStops.length > 0
      ? { block, text: result.text, tabStops: result.tabStops, activeIndex: 0 }
      : null;
    const fallback = trigger.from + insertion.text.length;
    block.setCursor(active?.from ?? fallback, active?.to ?? fallback, true);
    this.hide();
  }

  private remapTabSession(block: MathContent): void {
    const session = this.tabSession;
    if (!session || session.block !== block || session.text === block.text) return;
    const prefixLength = commonPrefixLength(session.text, block.text);
    const oldSuffixLength = commonSuffixLength(session.text, block.text, prefixLength);
    const oldChangedEnd = session.text.length - oldSuffixLength;
    const delta = block.text.length - session.text.length;
    session.tabStops = session.tabStops.map((tabStop) => {
      if (tabStop.from >= oldChangedEnd) {
        return { from: tabStop.from + delta, to: tabStop.to + delta };
      }
      if (tabStop.to < prefixLength) return tabStop;
      return {
        from: tabStop.from,
        to: Math.max(tabStop.from, tabStop.to + delta),
      };
    });
    session.text = block.text;
  }

  getItemElement(item: MathMenuItem): HTMLElement {
    return this.scrollElement?.querySelector(`[data-label="${item.label}"]`) as HTMLElement;
  }
}

function toMenuItem(template: MathTemplate): MathMenuItem {
  return {
    title: template.title,
    subTitle: `/${template.id}`,
    label: template.id,
    icon: template.icon,
  };
}

function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
}

function commonSuffixLength(left: string, right: string, prefixLength: number): number {
  const limit = Math.min(left.length, right.length) - prefixLength;
  let length = 0;
  while (
    length < limit
    && left[left.length - length - 1] === right[right.length - length - 1]
  ) length += 1;
  return length;
}
