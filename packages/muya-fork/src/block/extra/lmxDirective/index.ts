import type { Muya } from '../../../muya';
import type { ILmxDirectiveState } from '../../../state/types';
import {
    getLmxDefinition,
    validateQuickStyleAttributes,
    type QuickStyleValidation,
} from '@markdown/document-core';
import { mixins } from '../../../utils';
import Parent from '../../base/parent';
import IContainerQueryBlock from '../../mixins/containerQueryBlock';
import { ScrollPage } from '../../scrollPage';

const structuralNames = new Set([
    'theme-layout',
    'cover',
    'toc',
    'list-of-figures',
    'list-of-tables',
    'pagebreak',
]);

const previewNames = new Set([
  'theme-layout',
  'cover',
  'toc',
  'list-of-figures',
  'list-of-tables',
  'pagebreak',
]);

const mediaNames = new Set(['figure', 'table', 'listing']);

type QuickStyleAttributes = QuickStyleValidation['attributes'];
type QuickStyleProperty = Exclude<keyof QuickStyleAttributes, 'component' | 'theme'>;

const quickStyleProperties = [
    'color',
    'background',
    'fontFamily',
    'fontSizePt',
    'fontWeight',
    'fontStyle',
    'lineHeight',
    'letterSpacingPt',
    'align',
    'borderColor',
    'borderWidthPt',
    'borderRadiusPt',
    'marginMm',
    'paddingMm',
    'titleColor',
    'titleFontFamily',
    'titleFontSizePt',
    'titleFontWeight',
    'titleFontStyle',
    'titleLineHeight',
    'titleLetterSpacingPt',
] as const satisfies readonly QuickStyleProperty[];

const quickStyleClassNames: Record<QuickStyleProperty, string> = {
    color: 'mu-lmx-quick-color',
    background: 'mu-lmx-quick-background',
    fontFamily: 'mu-lmx-quick-font-family',
    fontSizePt: 'mu-lmx-quick-font-size',
    fontWeight: 'mu-lmx-quick-font-weight',
    fontStyle: 'mu-lmx-quick-font-style',
    lineHeight: 'mu-lmx-quick-line-height',
    letterSpacingPt: 'mu-lmx-quick-letter-spacing',
    align: 'mu-lmx-quick-align',
    borderColor: 'mu-lmx-quick-border-color',
    borderWidthPt: 'mu-lmx-quick-border-width',
    borderRadiusPt: 'mu-lmx-quick-border-radius',
    marginMm: 'mu-lmx-quick-margin',
    paddingMm: 'mu-lmx-quick-padding',
    titleColor: 'mu-lmx-quick-title-color',
    titleFontFamily: 'mu-lmx-quick-title-font-family',
    titleFontSizePt: 'mu-lmx-quick-title-font-size',
    titleFontWeight: 'mu-lmx-quick-title-font-weight',
    titleFontStyle: 'mu-lmx-quick-title-font-style',
    titleLineHeight: 'mu-lmx-quick-title-line-height',
    titleLetterSpacingPt: 'mu-lmx-quick-title-letter-spacing',
};

const quickStyleVariableNames: Record<QuickStyleProperty, string> = {
    color: '--mu-lmx-color',
    background: '--mu-lmx-background',
    fontFamily: '--mu-lmx-font-family',
    fontSizePt: '--mu-lmx-font-size',
    fontWeight: '--mu-lmx-font-weight',
    fontStyle: '--mu-lmx-font-style',
    lineHeight: '--mu-lmx-line-height',
    letterSpacingPt: '--mu-lmx-letter-spacing',
    align: '--mu-lmx-align',
    borderColor: '--mu-lmx-border-color',
    borderWidthPt: '--mu-lmx-border-width',
    borderRadiusPt: '--mu-lmx-border-radius',
    marginMm: '--mu-lmx-margin',
    paddingMm: '--mu-lmx-padding',
    titleColor: '--mu-lmx-title-color',
    titleFontFamily: '--mu-lmx-title-font-family',
    titleFontSizePt: '--mu-lmx-title-font-size',
    titleFontWeight: '--mu-lmx-title-font-weight',
    titleFontStyle: '--mu-lmx-title-font-style',
    titleLineHeight: '--mu-lmx-title-line-height',
    titleLetterSpacingPt: '--mu-lmx-title-letter-spacing',
};

const genericFontFamilies: Record<string, string> = {
    serif: 'Georgia, "Times New Roman", serif',
    'sans-serif': '"Avenir Next", Avenir, sans-serif',
    monospace: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

@mixins(IContainerQueryBlock)
class LmxDirective extends Parent {
    static override blockName = 'lmx-directive';

    private awaitingStructuralExit = false;

    private readonly handleJsonChange = ({ doc }: { doc?: unknown }) => {
        if (!Array.isArray(doc) || !this.parent)
            return;
        const state = stateAtPath(doc, this.path.slice(0, -1));
        if (!isLmxDirectiveState(state)
            || JSON.stringify(state.meta) === JSON.stringify(this.meta)) {
            return;
        }
        this.refreshMetadata(state.meta);
    };

    static create(muya: Muya, state: ILmxDirectiveState) {
        const directive = new LmxDirective(muya, state);
        for (const child of state.children)
            directive.append(ScrollPage.loadBlock(child.name).create(muya, child));

        return directive;
    }

    public meta: ILmxDirectiveState['meta'];

    override get path() {
        const offset = this.parent!.offset(this);
        return [...this.parent!.path, offset, 'children'];
    }

    constructor(muya: Muya, state: ILmxDirectiveState) {
        super(muya);
        this.meta = { ...state.meta, attributes: { ...state.meta.attributes } };
        this.tagName = 'section';
        this.classList = [
            'mu-lmx-directive',
            `mu-lmx-${state.meta.name.replace(/[^a-z0-9-]/gi, '-')}`,
        ];
        this.datasets = { lmxName: state.meta.name };
        this.attributes = {
            role: 'group',
            'aria-label': this.displayTitle,
        };
        if (structuralNames.has(state.meta.name)) {
            this.classList.push('mu-lmx-structure');
            this.attributes.contenteditable = 'false';
            this.attributes.tabindex = '0';
        }
        this.createDomNode();
        const definition = getLmxDefinition(state.meta.name);
        if (definition?.transparent) {
            this.classList.push('mu-lmx-transparent');
            this.domNode!.classList.add('mu-lmx-transparent');
        }
        if (!structuralNames.has(state.meta.name))
            this.applyQuickStyle();

        if (previewNames.has(state.meta.name)) {
            this.renderStructurePreview(state.meta.name);
        }
        else if (!definition?.transparent) {
            this.renderHeader();
            if (mediaNames.has(state.meta.name))
                this.renderMediaCaption();
        }
        this.listen();
        this.muya.eventCenter.on('json-change', this.handleJsonChange);
    }

    override remove(source = 'user') {
        this.muya.eventCenter.off('json-change', this.handleJsonChange);
        return super.remove(source);
    }

    override getState(): ILmxDirectiveState {
        return {
            name: 'lmx-directive',
            meta: { ...this.meta, attributes: { ...this.meta.attributes } },
            children: this.children.map(child => (child as Parent).getState()),
        };
    }

    private get displayTitle() {
        const customTitle = this.meta.attributes.title;
        if (typeof customTitle === 'string' && customTitle.trim().length > 0)
            return customTitle;

        return getLmxDefinition(this.meta.name)?.title ?? this.meta.name;
    }

    private refreshMetadata(meta: ILmxDirectiveState['meta']) {
        this.clearQuickStyle();
        this.meta = { ...meta, attributes: { ...meta.attributes } };
        this.domNode!.setAttribute('aria-label', this.displayTitle);
        if (this.meta.name === 'theme-layout') {
            this.domNode!.querySelector('.mu-lmx-structure-preview')?.remove();
            this.renderStructurePreview(this.meta.name);
        }
        if (!structuralNames.has(this.meta.name))
            this.applyQuickStyle();
    }

    private clearQuickStyle() {
        const classNames = new Set([
            'mu-lmx-quick-style',
            'mu-lmx-quick-border',
            ...Object.values(quickStyleClassNames),
        ]);
        this.classList = this.classList.filter(className => !classNames.has(className));
        this.domNode!.classList.remove(...classNames);
        for (const variableName of Object.values(quickStyleVariableNames))
            this.domNode!.style.removeProperty(variableName);
    }

    private applyQuickStyle() {
        const validation = validateQuickStyleAttributes(this.meta.attributes);
        if (!validation.valid)
            return;
        const attributes = validation.attributes;
        const presentProperties = quickStyleProperties.filter(property => attributes[property] !== undefined);
        if (presentProperties.length === 0)
            return;

        this.addQuickStyleClass('mu-lmx-quick-style');
        const style = this.domNode!.style;
        for (const property of presentProperties) {
            const value = attributes[property];
            if (value === undefined)
                continue;
            this.addQuickStyleClass(quickStyleClassNames[property]);
            style.setProperty(
                quickStyleVariableNames[property],
                quickStyleCssValue(property, value),
            );
        }
        if (presentProperties.some(property => (
            property === 'borderColor'
            || property === 'borderWidthPt'
            || property === 'borderRadiusPt'
        ))) {
            this.addQuickStyleClass('mu-lmx-quick-border');
        }
    }

    private addQuickStyleClass(className: string) {
        if (!this.classList.includes(className))
            this.classList.push(className);
        this.domNode!.classList.add(className);
    }

    private renderHeader() {
        const definition = getLmxDefinition(this.meta.name);
        const header = document.createElement('header');
        header.className = 'mu-lmx-header';
        header.contentEditable = 'false';

        const kind = document.createElement('span');
        kind.className = 'mu-lmx-kind';
        kind.textContent = definition?.title ?? this.meta.name;

        header.append(kind);

        const customTitle = this.meta.attributes.title;
        if (typeof customTitle === 'string' && customTitle.trim().length > 0) {
            const title = document.createElement('strong');
            title.className = 'mu-lmx-title';
            title.textContent = customTitle;
            header.append(title);
        }

        if (this.meta.identifier) {
            const label = document.createElement('code');
            label.className = 'mu-lmx-label';
            label.textContent = `#${this.meta.identifier}`;
            header.append(label);
        }

        if (structuralNames.has(this.meta.name)) {
            const hint = document.createElement('span');
            hint.className = 'mu-lmx-hint';
            hint.textContent = 'Chỉnh nội dung trong Properties';
            header.append(hint);
        }
        this.domNode!.append(header);
    }

    private renderMediaCaption() {
        const caption = this.meta.attributes.caption;
        if (typeof caption !== 'string' || caption.trim().length === 0)
            return;

        const element = document.createElement('div');
        element.className = 'mu-lmx-caption';
        element.textContent = caption;
        element.contentEditable = 'false';
        this.domNode!.append(element);
    }

    private renderStructurePreview(name: string) {
        const preview = document.createElement('div');
        preview.className = `mu-lmx-structure-preview mu-lmx-${name}-preview`;
        preview.setAttribute('aria-label', this.displayTitle);
        // The callback runs before attachment, so parent traversal cannot read
        // the marker. Pass only its literal identity, never executable content.
        if (name === 'theme-layout' && typeof this.meta.attributes.node === 'string') {
            preview.dataset.authoredLayoutNodeId = this.meta.attributes.node;
        }
        const renderer = this.muya.options.structurePreviewRenderer;
        if (renderer) {
            renderer({ name, title: this.displayTitle, container: preview });
        }
        else {
            this.renderGeneratedListPreview(preview, name);
        }
        this.domNode!.append(preview);
    }

    private renderGeneratedListPreview(preview: HTMLElement, name: string) {
        if (name === 'theme-layout') {
            appendText(preview, 'mu-lmx-generated-empty', 'Authored section preview renderer is unavailable.');
            return;
        }
        const title = name === 'cover'
            ? 'TRANG BÌA'
            : name === 'toc'
            ? 'MỤC LỤC'
            : name === 'list-of-figures' ? 'DANH SÁCH HÌNH' : 'DANH SÁCH BẢNG';
        appendText(preview, 'mu-lmx-generated-title', title);
        const list = document.createElement('div');
        list.className = 'mu-lmx-generated-list';
        const empty = document.createElement('p');
        empty.className = 'mu-lmx-generated-empty';
        empty.textContent = name === 'toc' ? 'Mục lục sẽ được tạo từ các heading.' : 'Chưa có mục nào.';
        list.append(empty);
        preview.append(list);
    }

    private listen() {
        this.muya.eventCenter.attachDOMEvent(this.domNode!, 'click', () => {
            this.awaitingStructuralExit = false;
            this.emitSelection();
        });
        if (structuralNames.has(this.meta.name)) {
            this.muya.eventCenter.attachDOMEvent(this.domNode!, 'keydown', event => {
                const keyboardEvent = event as KeyboardEvent;
                keyboardEvent.stopPropagation();
                if (keyboardEvent.key === ' ') {
                    this.awaitingStructuralExit = false;
                    keyboardEvent.preventDefault();
                    this.emitSelection();
                    return;
                }

                if (keyboardEvent.key !== 'Enter') {
                    this.awaitingStructuralExit = false;
                    return;
                }

                keyboardEvent.preventDefault();
                if (!this.awaitingStructuralExit) {
                    this.awaitingStructuralExit = true;
                    this.emitSelection();
                    return;
                }

                this.awaitingStructuralExit = false;
                const outside = ScrollPage.loadBlock('paragraph').create(
                    this.muya,
                    { name: 'paragraph', text: '' },
                );
                this.parent!.insertAfter(outside, this);
                outside.firstContentInDescendant()!.setCursor(0, 0, true);
            });
            this.muya.eventCenter.attachDOMEvent(this.domNode!, 'blur', () => {
                this.awaitingStructuralExit = false;
            });
        }
    }

    private emitSelection() {
        this.muya.eventCenter.emit('lmx-block-selected', {
            name: this.meta.name,
            identifier: this.meta.identifier ?? null,
            attributes: { ...this.meta.attributes },
            path: this.path.slice(0, -1),
        });
    }
}

function stateAtPath(states: unknown[], path: Array<string | number>): unknown {
    let value: unknown = states;
    for (const segment of path) {
        if (typeof segment === 'number') {
            if (!Array.isArray(value)) return undefined;
            value = value[segment];
        }
        else {
            if (typeof value !== 'object' || value === null) return undefined;
            value = (value as Record<string, unknown>)[segment];
        }
    }
    return value;
}

function isLmxDirectiveState(value: unknown): value is ILmxDirectiveState {
    if (typeof value !== 'object' || value === null)
        return false;
    const state = value as Partial<ILmxDirectiveState>;
    return state.name === 'lmx-directive'
        && typeof state.meta === 'object'
        && state.meta !== null
        && typeof state.meta.name === 'string'
        && typeof state.meta.attributes === 'object'
        && state.meta.attributes !== null;
}

function quickStyleCssValue(
    property: QuickStyleProperty,
    value: NonNullable<QuickStyleAttributes[QuickStyleProperty]>,
): string {
    if (property === 'fontFamily' || property === 'titleFontFamily')
        return cssFontFamily(String(value));
    if (property === 'fontSizePt' || property === 'titleFontSizePt'
        || property === 'letterSpacingPt' || property === 'titleLetterSpacingPt'
        || property === 'borderWidthPt' || property === 'borderRadiusPt') {
        return `${value}pt`;
    }
    if (property === 'marginMm' || property === 'paddingMm')
        return `${value}mm`;
    return String(value);
}

function cssFontFamily(value: string): string {
    const generic = genericFontFamilies[value.trim().toLowerCase()];
    if (generic)
        return generic;
    const escaped = value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
    return `"${escaped}"`;
}

function appendText(parent: HTMLElement, className: string, text: string) {
    const element = document.createElement('div');
    element.className = className;
    element.textContent = text;
    parent.append(element);
}

export default LmxDirective;
