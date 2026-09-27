import type Content from '../block/base/content';
import type Format from '../block/base/format';
import type Parent from '../block/base/parent';
import type { Muya } from '../muya';
import type { TState } from '../state/types';
import type { Nullable } from '../types';
import * as otText from 'ot-text-unicode';
import { fromEvent, merge } from 'rxjs';
import { registerBlocks } from '../block';
import { ScrollPage } from '../block/scrollPage';
import Clipboard from '../clipboard';
import { BLOCK_DOM_PROPERTY, isFirefox } from '../config';
import History from '../history';
import InlineRenderer from '../inlineRenderer';
import { Search } from '../search';
import Selection from '../selection';
import JSONState from '../state';
import { hasPick } from '../utils';
import logger from '../utils/logger';
import { attachLinkMouseHandlers } from './linkMouseEvents';

const debug = logger('editor:');

export class Editor {
    jsonState: JSONState;
    inlineRenderer: InlineRenderer;
    selection: Selection;
    searchModule: Search;
    clipboard: Clipboard;
    history: History;
    scrollPage: Nullable<ScrollPage> = null;

    private _activeContentBlock: Nullable<Content> = null;

    constructor(public muya: Muya) {
        const state = muya.options.json || muya.options.markdown || '';

        this.jsonState = new JSONState(muya, state);
        this.inlineRenderer = new InlineRenderer(muya);
        this.selection = new Selection(muya);
        this.searchModule = new Search(muya);
        this.clipboard = Clipboard.create(muya);
        this.history = new History(muya);
    }

    get activeContentBlock() {
        return this._activeContentBlock;
    }

    set activeContentBlock(block) {
        const { activeContentBlock: oldActiveContentBlock } = this;
        if (block !== oldActiveContentBlock) {
            this._activeContentBlock = block;
            if (oldActiveContentBlock)
                oldActiveContentBlock.blurHandler();

            if (block)
                block.focusHandler();
        }
    }

    init() {
        registerBlocks();

        const { muya } = this;
        const state = this.jsonState.getState();

        this.scrollPage = ScrollPage.create(muya, state);

        this._dispatchEvents();
        // marktext cb25b3d4 (#1415): hovering a rendered link wrapper
        // dispatches `muya-link-tools` so the staged popover lights up.
        // Cleanup is handled by `muya.destroy()` → `detachAllDomEvents`.
        attachLinkMouseHandlers(muya);
        this.focus();
    }

    private _dispatchEvents() {
        const { domNode } = this.muya;

        const eventHandler = (event: Event) => {
            const { anchorBlock, isSelectionInSameBlock }
                = this.selection.getSelection() ?? {};
            // Fix issue that language input can not get focus when it's empty(Firefox only)
            if (
                event.type === 'click'
                && isFirefox
                && (event.target as HTMLElement).textContent === ''
                && (event.target as HTMLElement).classList.contains('mu-language-input')
            ) {
                ((event.target as Element)[BLOCK_DOM_PROPERTY] as Content)?.setCursor(
                    0,
                    0,
                    true,
                );
                return;
            }

            if (!isSelectionInSameBlock || !anchorBlock) {
                this.activeContentBlock = null;
                return;
            }

            this.activeContentBlock = anchorBlock;

            switch (event.type) {
                case 'click': {
                    anchorBlock.clickHandler(event);
                    this._emitStandardBlockSelection(anchorBlock.outMostBlock);
                    break;
                }
                case 'input': {
                    anchorBlock.inputHandler(event);
                    break;
                }
                case 'keydown': {
                    anchorBlock.keydownHandler(event);
                    break;
                }
                case 'keyup': {
                    anchorBlock.keyupHandler(event);
                    break;
                }
                case 'compositionend':
                case 'compositionstart': {
                    anchorBlock.composeHandler(event);
                    break;
                }
            }
        };

        merge(
            fromEvent(domNode, 'click'),
            fromEvent(domNode, 'input'),
            fromEvent(domNode, 'keydown'),
            fromEvent(domNode, 'keyup'),
            fromEvent(domNode, 'compositionend'),
            fromEvent(domNode, 'compositionstart'),
        ).subscribe(eventHandler);
    }

    private _emitStandardBlockSelection(block: Nullable<Parent>) {
        if (!block || block.parent !== this.scrollPage)
            return;
        const state = block.getState();
        let component: string | null = null;
        if (state.name === 'paragraph')
            component = 'paragraph';
        else if (state.name === 'atx-heading' || state.name === 'setext-heading')
            component = `heading-${Math.min(Math.max(state.meta.level, 1), 4)}`;
        if (!component)
            return;
        const path = block.getJsonPath();
        if (path.length !== 1 || !Number.isInteger(path[0]))
            return;
        this.muya.eventCenter.emit('lmx-block-selected', {
            name: 'style',
            identifier: null,
            attributes: { component },
            path,
        });
    }

    focus() {
    // TODO: the cursor maybe passed by muya options.cursor, and no need to find the first leaf block.
        const firstLeafBlock = this.scrollPage?.firstContentInDescendant();

        if (firstLeafBlock == null)
            return;

        const cursor = {
            path: firstLeafBlock.path,
            block: firstLeafBlock,
            anchor: {
                offset: 0,
            },
            focus: {
                offset: 0,
            },
        };

        const needUpdated
            = firstLeafBlock.blockName === 'paragraph.content'
                && (firstLeafBlock as Format).checkNeedRender(cursor);

        firstLeafBlock.setCursor(0, 0, needUpdated);
    }

    updateContents(operations: any, selection: any, source: any) {
        const { muya } = this;
        this.jsonState.dispatch(operations, source);

        // Codes bellow are copy from `ot-json1.apply` and modified.
        if (operations === null)
            return;

        // Phase 1: Pick. Returns updated subDocument.
        function pick(subDoc: any, descent: any) {
            const stack = [];

            let i = 0;

            for (; i < descent.length; i++) {
                const d = descent[i];
                if (Array.isArray(d))
                    break;
                if (typeof d === 'object')
                    continue;
                stack.push(subDoc);
                // Its valid to descend into a null space - just we can't pick there.
                subDoc = subDoc == null ? undefined : subDoc.queryBlock([d]);
            }

            // Children. These need to be traversed in reverse order here.
            for (let j = descent.length - 1; j >= i; j--)
                subDoc = pick(subDoc, descent[j]);

            // Then back again.
            for (--i; i >= 0; i--) {
                const d = descent[i];
                if (typeof d !== 'object') {
                    const container = stack.pop();
                    if (
                        subDoc
                        === (container == null ? undefined : container.queryBlock([d]))
                    ) {
                        subDoc = container;
                    }
                    else {
                        if (subDoc === undefined) {
                            // TODO: handler typeof d === 'string'
                            typeof d === 'number' && container.find(d).remove('api');
                            subDoc = container;
                        }
                        else {
                            typeof d === 'number'
                            && container.find(d).replaceWith(subDoc, 'api');
                            subDoc = container;
                        }
                    }
                }
                else if (hasPick(d)) {
                    subDoc = undefined;
                }
            }

            return subDoc;
        }

        const snapshot = pick(this.scrollPage, operations);

        function drop(root: any, descent: any) {
            let subDoc = root;
            let i = 0; // For reading
            let m = 0;
            const rootContainer = { root }; // This is an avoidable allocation.
            let container: any = rootContainer;
            let key = 'root'; // For writing

            function mut() {
                for (; m < i; m++) {
                    const d = descent[m];
                    if (typeof d === 'object')
                        continue;
                    container
                        = key === 'root' ? container[key] : container.queryBlock([key]);
                    key = d;
                }
            }

            for (; i < descent.length; i++) {
                const d = descent[i];

                if (Array.isArray(d)) {
                    const child = drop(subDoc, d);
                    if (child !== subDoc && child !== undefined) {
                        mut();
                        // It maybe never go into this if statement.
                        subDoc = container[key] = child;
                    }
                }
                else if (typeof d === 'object') {
                    if (d.i !== undefined) {
                        // Insert
                        mut();
                        const ref = container.find(key);
                        if (typeof key === 'number') {
                            const newBlock = ScrollPage.loadBlock(d.i.name).create(muya, d.i);
                            container.insertBefore(newBlock, ref, 'api');

                            subDoc = newBlock;
                        }
                        else {
                            switch (key) {
                                case 'checked': {
                                    ref.update(d.i, 'api');
                                    break;
                                }

                                case 'meta':
                                    // Do nothing.
                                    break;

                                default:
                                    debug.warn(`Unknown operation path ${key}`);
                                    break;
                            }
                        }
                    }

                    if (d.es) {
                        // Edit. Ok because its illegal to drop inside mixed region
                        mut();
                        if (subDoc.blockName === 'table.cell') {
                            subDoc.align = otText.type.apply(subDoc.align, d.es);
                        }
                        else if (subDoc.blockName === 'language-input') {
                            subDoc._text = otText.type.apply(subDoc.text, d.es);
                            subDoc.parent.meta.lang = subDoc.text;
                            subDoc.update();
                        }
                        else if (subDoc.blockName === 'code-block') {
                            // Handle modify code block type.
                            subDoc.meta.type = otText.type.apply(subDoc.meta.type, d.es);
                        }
                        else {
                            subDoc._text = otText.type.apply(subDoc.text, d.es);
                            subDoc.update();
                        }
                    }
                }
                else {
                    subDoc = subDoc != null ? subDoc.queryBlock([d]) : undefined;
                }
            }

            return rootContainer.root;
        }

        drop(snapshot, operations);

        if (selection) {
            const { anchorPath, anchor, focus, isSelectionInSameBlock } = selection;
            const cursorBlock = this.scrollPage?.queryBlock(anchorPath);

            const begin = Math.min(anchor.offset, focus.offset);
            const end = Math.max(anchor.offset, focus.offset);

            if (isSelectionInSameBlock && cursorBlock && cursorBlock.isContent())
                cursorBlock.setCursor(begin, end, true);
            else
                this.selection.setSelection(selection);
        }
    }

    setContent(content: TState[] | string, autoFocus = false) {
        this.jsonState.setContent(content);
        const state = this.jsonState.getState();

        this.scrollPage!.updateState(state);
        this.history.clear();

        if (autoFocus)
            this.focus();
    }

    removeTopLevelBlocks(indices: number[]) {
        const scrollPage = this.scrollPage;
        if (!scrollPage)
            return false;

        const validIndices = [...new Set(indices)]
            .filter(index => Number.isInteger(index) && index >= 0 && index < scrollPage.length())
            .sort((a, b) => b - a);
        if (validIndices.length === 0)
            return false;

        const removedIndices = new Set(validIndices);
        const nearestIndex = Math.min(...validIndices);
        let survivor: Parent | null = null;
        for (let distance = 0; distance < scrollPage.length(); distance += 1) {
            for (const candidateIndex of [nearestIndex + distance, nearestIndex - distance - 1]) {
                if (candidateIndex < 0 || candidateIndex >= scrollPage.length()
                    || removedIndices.has(candidateIndex)) continue;
                const candidate = scrollPage.find(candidateIndex) as Parent | null;
                if (this._editableContentIn(candidate)) {
                    survivor = candidate;
                    break;
                }
            }
            if (survivor) break;
        }
        const historyFocus = this._editableContentIn(survivor);
        if (historyFocus) {
            historyFocus.setCursor(0, 0, true);
            this.history.getLastSelection();
        }
        this.history.cutoff();
        for (const index of validIndices)
            scrollPage.find(index)?.remove('user');

        if (scrollPage.length() === 0) {
            const paragraph = ScrollPage.loadBlock('paragraph').create(
                this.muya,
                { name: 'paragraph', text: '' },
            );
            scrollPage.append(paragraph, 'user');
            this._editableContentIn(paragraph)?.setCursor(0, 0, true);
        }
        else if (historyFocus) {
            historyFocus.setCursor(0, 0, true);
        }
        else {
            document.getSelection()?.removeAllRanges();
            this.activeContentBlock = null;
        }
        return true;
    }

    insertTopLevelBlock(index: number, state: TState): boolean {
        const scrollPage = this.scrollPage;
        if (!scrollPage || !state || typeof state.name !== 'string') return false;
        const blockFactory = ScrollPage.loadBlock(state.name);
        if (!blockFactory) return false;
        const boundedIndex = Math.max(0, Math.min(scrollPage.length(), Math.trunc(index)));
        const block = blockFactory.create(this.muya, state);
        this.history.cutoff();
        if (boundedIndex >= scrollPage.length()) scrollPage.append(block, 'user');
        else scrollPage.insertBefore(block, scrollPage.find(boundedIndex) as Parent, 'user');
        // Keep the history selection on a visible editable survivor. Atomic
        // cover/pagebreak children are hidden and cannot own a text caret.
        const focusBlock = (scrollPage.find(boundedIndex + 1) as Parent | null)
            ?? (scrollPage.find(boundedIndex - 1) as Parent | null)
            ?? block;
        this._editableContentIn(focusBlock)?.setCursor(0, 0, true);
        return true;
    }

    insertTopLevelBlocks(index: number, states: TState[], focusIndex: number): boolean {
        const scrollPage = this.scrollPage;
        if (
            !scrollPage
            || states.length === 0
            || !Number.isInteger(focusIndex)
            || focusIndex < 0
            || focusIndex >= states.length
        ) {
            return false;
        }

        const factories = states.map((state) => {
            if (!state || typeof state.name !== 'string') return null;
            return ScrollPage.loadBlock(state.name);
        });
        if (factories.some(factory => factory == null)) return false;

        const blocks = factories.map((factory, stateIndex) =>
            factory!.create(this.muya, states[stateIndex]),
        );
        const boundedIndex = Math.max(0, Math.min(scrollPage.length(), Math.trunc(index)));
        const referenceBlock = scrollPage.find(boundedIndex) as Parent | null;
        const historyFocusBlock = (scrollPage.find(boundedIndex - 1) as Parent | null)
            ?? referenceBlock;

        // Record a selection that survives Undo before focusing the newly
        // inserted writable block. Ignore hidden descendants of atomic pages.
        const historyFocus = this._editableContentIn(historyFocusBlock);
        historyFocus?.setCursor(0, 0, true);
        if (historyFocus) this.history.getLastSelection();
        this.history.cutoff();
        if (referenceBlock) {
            for (const block of blocks)
                scrollPage.insertBefore(block, referenceBlock, 'user');
        }
        else {
            scrollPage.append(...blocks, 'user');
        }

        const insertedFocus = this._editableContentIn(blocks[focusIndex]);
        if (insertedFocus)
            insertedFocus.setCursor(0, 0, true);
        else {
            document.getSelection()?.removeAllRanges();
            this.activeContentBlock = null;
        }
        return true;
    }

    private _editableContentIn(block: Parent | null): Content | null {
        const content = block?.firstContentInDescendant() ?? null;
        const domNode = content?.domNode;
        if (!content || !domNode?.isConnected || domNode.closest('[contenteditable="false"]'))
            return null;
        return content;
    }

    replaceTopLevelBlocks(
        index: number,
        deleteCount: number,
        states: TState[],
        focusIndex = -1,
    ): boolean {
        const scrollPage = this.scrollPage;
        if (
            !scrollPage
            || !Number.isInteger(index)
            || !Number.isInteger(deleteCount)
            || index < 0
            || deleteCount < 0
            || index + deleteCount > scrollPage.length()
            || states.length === 0
        ) {
            return false;
        }

        const factories = states.map((state) => {
            if (!state || typeof state.name !== 'string') return null;
            return ScrollPage.loadBlock(state.name);
        });
        if (factories.some(factory => factory == null)) return false;
        const blocks = factories.map((factory, stateIndex) =>
            factory!.create(this.muya, states[stateIndex]),
        );
        const survivor = (scrollPage.find(index - 1) as Parent | null)
            ?? (scrollPage.find(index + deleteCount) as Parent | null);
        const historyFocus = this._editableContentIn(survivor);

        if (historyFocus) {
            historyFocus.setCursor(0, 0, true);
            this.history.getLastSelection();
        }
        else {
            document.getSelection()?.removeAllRanges();
            this.activeContentBlock = null;
        }
        this.history.cutoff();
        for (let offset = 0; offset < deleteCount; offset += 1)
            scrollPage.find(index)?.remove('user');

        const referenceBlock = scrollPage.find(index) as Parent | null;
        if (referenceBlock) {
            for (const block of blocks)
                scrollPage.insertBefore(block, referenceBlock, 'user');
        }
        else {
            scrollPage.append(...blocks, 'user');
        }

        const boundedFocusIndex = Number.isInteger(focusIndex)
            && focusIndex >= 0
            && focusIndex < blocks.length
            ? focusIndex
            : -1;
        const replacementFocus = boundedFocusIndex >= 0
            ? this._editableContentIn(blocks[boundedFocusIndex])
            : null;
        if (replacementFocus)
            replacementFocus.setCursor(0, 0, true);
        else if (!historyFocus) {
            document.getSelection()?.removeAllRanges();
            this.activeContentBlock = null;
        }
        return true;
    }
}
