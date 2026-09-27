// @vitest-environment happy-dom

import { beforeAll, describe, expect, it } from 'vitest';
import { Muya } from '../../muya';
import prism, { loadedLanguages } from '../../utils/prism';
import { MarkdownToState } from '../markdownToState';
import ExportMarkdown from '../stateToMarkdown';

beforeAll(() => {
    // Code blocks apply their language on requestAnimationFrame after setContent.
    // Keep the local grammar installed for the lifetime of this isolated worker.
    prism.languages.swift = prism.languages.javascript;
    loadedLanguages.add('swift');
});

const theoremSource = [
    ':::theorem {#thm-bayes title="Định lý Bayes"}',
    'Nội dung tiếng Việt với $P(A \\mid B)$.',
    ':::',
    '',
].join('\n');

describe('LMX directive state', () => {
    it('passes theme-layout node identity to the detached preview callback and preserves the marker through selection', () => {
        const host = document.createElement('section');
        document.body.append(host);
        const received: string[] = [];
        const muya = new Muya(host, {
            frontMatter: true,
            structurePreviewRenderer: ({ name, container }) => {
                if (name === 'theme-layout') {
                    received.push(container.dataset.authoredLayoutNodeId ?? '');
                    container.textContent = 'Section preview';
                }
            },
        });
        muya.init();
        const source = ':::theme-layout {node="intro"}\n:::\n';
        try {
            muya.setContent(source);
            expect(received).toContain('intro');
            const card = muya.domNode.querySelector<HTMLElement>('[data-lmx-name="theme-layout"]')!;
            expect(card.getAttribute('contenteditable')).toBe('false');
            card.click();
            expect(card.textContent).toContain('Section preview');
            expect(muya.getMarkdown()).toBe(source);
        } finally {
            muya.destroy();
            host.remove();
        }
    });
    it('converts a theorem into a semantic state and round-trips Markdown', () => {
        const states = new MarkdownToState().generate(theoremSource);

        expect(states).toMatchObject([
            {
                name: 'lmx-directive',
                meta: {
                    name: 'theorem',
                    identifier: 'thm-bayes',
                    attributes: { title: 'Định lý Bayes' },
                },
                children: [{ name: 'paragraph' }],
            },
        ]);
        expect(new ExportMarkdown().generate(states)).toBe(theoremSource);
    });

    it('renders a semantic card without exposing directive fences', () => {
        const host = document.createElement('section');
        document.body.append(host);
        const muya = new Muya(host, { frontMatter: true, math: true });
        muya.init();

        muya.setContent(theoremSource);

        const card = document.querySelector<HTMLElement>('.mu-lmx-directive');
        expect(card?.dataset.lmxName).toBe('theorem');
        expect(card?.querySelector('.mu-lmx-title')?.textContent).toBe('Định lý Bayes');
        expect(card?.textContent).toContain('Nội dung tiếng Việt');
        expect(card?.textContent).not.toContain(':::');
        muya.destroy();
    });

    it('maps expanded Quick Edit attributes to allowlisted classes and CSS variables', () => {
        const host = document.createElement('section');
        document.body.append(host);
        const muya = new Muya(host, { frontMatter: true });
        muya.init();
        const source = [
            ':::style {align="justify" background="#F0EAD6" borderColor="#654321" borderRadiusPt=4 borderWidthPt=1.5 color="#123456" component="paragraph" fontFamily="serif" fontSizePt=13 fontStyle="italic" fontWeight="700" letterSpacingPt=0.5 lineHeight=1.75 marginMm=5 paddingMm=3}',
            'Nội dung được định dạng.',
            ':::',
            '',
        ].join('\n');

        try {
            muya.setContent(source);

            const wrapper = document.querySelector<HTMLElement>('[data-lmx-name="style"]');
            expect(wrapper?.classList.contains('mu-lmx-quick-style')).toBe(true);
            expect([...wrapper?.classList ?? []]).toEqual(expect.arrayContaining([
                'mu-lmx-quick-color',
                'mu-lmx-quick-background',
                'mu-lmx-quick-font-family',
                'mu-lmx-quick-font-size',
                'mu-lmx-quick-font-weight',
                'mu-lmx-quick-font-style',
                'mu-lmx-quick-line-height',
                'mu-lmx-quick-letter-spacing',
                'mu-lmx-quick-align',
                'mu-lmx-quick-border',
                'mu-lmx-quick-border-color',
                'mu-lmx-quick-border-width',
                'mu-lmx-quick-border-radius',
                'mu-lmx-quick-padding',
                'mu-lmx-quick-margin',
            ]));
            expect(wrapper?.style.cssText).toContain('--mu-lmx-color: #123456');
            expect(wrapper?.style.cssText).toContain('--mu-lmx-background: #F0EAD6');
            expect(wrapper?.style.cssText).toContain('--mu-lmx-font-family: Georgia, "Times New Roman", serif');
            expect(wrapper?.style.cssText).toContain('--mu-lmx-font-size: 13pt');
            expect(wrapper?.style.cssText).toContain('--mu-lmx-font-weight: 700');
            expect(wrapper?.style.cssText).toContain('--mu-lmx-font-style: italic');
            expect(wrapper?.style.cssText).toContain('--mu-lmx-line-height: 1.75');
            expect(wrapper?.style.cssText).toContain('--mu-lmx-letter-spacing: 0.5pt');
            expect(wrapper?.style.cssText).toContain('--mu-lmx-align: justify');
            expect(wrapper?.style.cssText).toContain('--mu-lmx-border-color: #654321');
            expect(wrapper?.style.cssText).toContain('--mu-lmx-border-width: 1.5pt');
            expect(wrapper?.style.cssText).toContain('--mu-lmx-border-radius: 4pt');
            expect(wrapper?.style.cssText).toContain('--mu-lmx-padding: 3mm');
            expect(wrapper?.style.cssText).toContain('--mu-lmx-margin: 5mm');
            expect(wrapper?.style.color).toBe('');
            expect(wrapper?.style.backgroundColor).toBe('');
            expect(wrapper?.style.fontSize).toBe('');
            expect(wrapper?.style.cssText).not.toContain('component');
            expect(muya.getMarkdown()).toContain('fontWeight="700"');
        }
        finally {
            muya.destroy();
        }
    });

    it('renders block and title Quick Edit properties on semantic directives', () => {
        const host = document.createElement('section');
        document.body.append(host);
        const muya = new Muya(host, { frontMatter: true });
        muya.init();
        const source = [
            ':::theorem {#thm-style color="#183153" fontSizePt=14 fontStyle="normal" fontWeight="700" title="Định lý có kiểu" titleColor="#A12424" titleFontFamily="sans-serif" titleFontSizePt=18 titleFontStyle="italic" titleFontWeight="600" titleLetterSpacingPt=0.25 titleLineHeight=1.25}',
            'Nội dung định lý.',
            ':::',
            '',
        ].join('\n');

        try {
            muya.setContent(source);

            const theorem = document.querySelector<HTMLElement>('[data-lmx-name="theorem"]');
            expect(theorem?.classList.contains('mu-lmx-quick-style')).toBe(true);
            expect([...theorem?.classList ?? []]).toEqual(expect.arrayContaining([
                'mu-lmx-quick-color',
                'mu-lmx-quick-font-size',
                'mu-lmx-quick-font-weight',
                'mu-lmx-quick-font-style',
                'mu-lmx-quick-title-color',
                'mu-lmx-quick-title-font-family',
                'mu-lmx-quick-title-font-size',
                'mu-lmx-quick-title-font-style',
                'mu-lmx-quick-title-font-weight',
                'mu-lmx-quick-title-letter-spacing',
                'mu-lmx-quick-title-line-height',
            ]));
            expect(theorem?.style.getPropertyValue('--mu-lmx-color')).toBe('#183153');
            expect(theorem?.style.getPropertyValue('--mu-lmx-title-color')).toBe('#A12424');
            expect(theorem?.style.getPropertyValue('--mu-lmx-title-font-family')).toContain('Avenir Next');
            expect(theorem?.style.getPropertyValue('--mu-lmx-title-font-size')).toBe('18pt');
            expect(theorem?.style.getPropertyValue('--mu-lmx-title-font-style')).toBe('italic');
            expect(theorem?.style.getPropertyValue('--mu-lmx-title-font-weight')).toBe('600');
            expect(theorem?.style.getPropertyValue('--mu-lmx-title-letter-spacing')).toBe('0.25pt');
            expect(theorem?.style.getPropertyValue('--mu-lmx-title-line-height')).toBe('1.25');
            expect(theorem?.querySelector('.mu-lmx-title')?.textContent).toBe('Định lý có kiểu');
            expect(muya.getMarkdown()).toBe(source);
        }
        finally {
            muya.destroy();
        }
    });

    it('ignores invalid and unknown Quick Edit values without exposing CSS injection', () => {
        const host = document.createElement('section');
        document.body.append(host);
        const muya = new Muya(host, { frontMatter: true });
        muya.init();
        const source = [
            ':::style {align="start" borderColor="#fff" borderRadiusPt=101 borderWidthPt=-1 color="red; background:url(https://invalid.test/x)" fontFamily="url(https://invalid.test/font)" fontSizePt=200 fontStyle="oblique 20deg" fontWeight="650" letterSpacingPt=100 lineHeight=8 marginMm=101 paddingMm=-2 rawCss="position:fixed" titleColor="currentColor" titleFontFamily="input{evil}" titleFontSizePt=2 titleFontStyle="oblique" titleFontWeight="900" titleLetterSpacingPt=-11 titleLineHeight=5}',
            'Nội dung an toàn.',
            ':::',
            '',
        ].join('\n');

        try {
            muya.setContent(source);

            const wrapper = document.querySelector<HTMLElement>('[data-lmx-name="style"]');
            expect(wrapper?.classList.contains('mu-lmx-quick-style')).toBe(false);
            expect(wrapper?.style.cssText).toBe('');
            expect(wrapper?.outerHTML).not.toContain('invalid.test');
            expect(wrapper?.outerHTML).not.toContain('position:fixed');
            expect(muya.getMarkdown()).toBe(source);
        }
        finally {
            muya.destroy();
        }
    });

    it('renders media captions from semantic directive attributes', () => {
        const host = document.createElement('section');
        document.body.append(host);
        const muya = new Muya(host, { frontMatter: true });
        muya.init();

        muya.setContent([
            ':::figure {caption="Hình minh họa"}',
            '![Ảnh](assets/image.png)',
            ':::',
            '',
            ':::table {caption="Bảng dữ liệu"}',
            '| A |',
            '| --- |',
            '| 1 |',
            ':::',
            '',
            ':::listing {caption="Mã nguồn" language="swift"}',
            '```swift',
            'let value = 1',
            '```',
            ':::',
        ].join('\n'));

        expect([...document.querySelectorAll<HTMLElement>('.mu-lmx-caption')].map((caption) => caption.textContent)).toEqual([
            'Hình minh họa',
            'Bảng dữ liệu',
            'Mã nguồn',
        ]);
        muya.destroy();
    });

    it('renders the complete HCMUT theorem family without duplicating default titles', () => {
        const host = document.createElement('section');
        document.body.append(host);
        const muya = new Muya(host, { frontMatter: true, math: true });
        muya.init();

        muya.setContent([
            ':::theorem', 'Nội dung định lý.', ':::', '',
            ':::property', 'Nội dung tính chất.', ':::', '',
            ':::proposition', 'Nội dung mệnh đề.', ':::', '',
            ':::corollary', 'Nội dung hệ quả.', ':::', '',
            ':::lemma', 'Nội dung bổ đề.', ':::', '',
            ':::exercise', 'Nội dung bài toán.', ':::', '',
        ].join('\n'));

        const cards = [...document.querySelectorAll<HTMLElement>('.mu-lmx-directive')];
        expect(cards.map(card => card.dataset.lmxName)).toEqual([
            'theorem', 'property', 'proposition', 'corollary', 'lemma', 'exercise',
        ]);
        expect(cards.map(card => card.querySelector('.mu-lmx-kind')?.textContent)).toEqual([
            'Định lý', 'Tính chất', 'Mệnh đề', 'Hệ quả', 'Bổ đề', 'Bài toán',
        ]);
        expect(cards.every(card => card.querySelector('.mu-lmx-title') === null)).toBe(true);
        muya.destroy();
    });

    it('renders structural markers as non-editable placement cards', () => {
        const host = document.createElement('section');
        document.body.append(host);
        const muya = new Muya(host, { frontMatter: true });
        muya.init();

        muya.setContent(':::cover\n:::\n\n:::toc\n:::\n');

        const markers = [...document.querySelectorAll<HTMLElement>('.mu-lmx-structure')];
        expect(markers.map(marker => marker.dataset.lmxName)).toEqual(['cover', 'toc']);
        expect(markers.every(marker => marker.getAttribute('contenteditable') === 'false')).toBe(true);
        expect(muya.getMarkdown()).toBe(':::cover\n:::\n\n:::toc\n:::\n');
        muya.destroy();
    });

    it('removes selected top-level Markdown blocks as one undoable edit', async () => {
        const host = document.createElement('section');
        document.body.append(host);
        const muya = new Muya(host, { frontMatter: true });
        muya.init();
        muya.setContent('# Trang đầu\n\n:::cover\n:::\n\n# Trang cuối\n');
        try {
            expect(muya.removeTopLevelBlocks([1])).toBe(true);
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            expect(muya.getMarkdown()).toBe('# Trang đầu\n\n# Trang cuối\n');

            muya.undo();
            expect(muya.getMarkdown()).toBe('# Trang đầu\n\n:::cover\n:::\n\n# Trang cuối\n');
        }
        finally {
            muya.destroy();
        }
    });

    it('inserts a top-level page break and restores it with undo', async () => {
        const host = document.createElement('section');
        document.body.append(host);
        const muya = new Muya(host, { frontMatter: true });
        muya.init();
        muya.setContent('# Trang đầu\n');

        expect(muya.insertTopLevelBlock(1, {
            name: 'lmx-directive',
            meta: { name: 'pagebreak', attributes: {} },
            children: [{ name: 'paragraph', text: '' }],
        })).toBe(true);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        expect(muya.getMarkdown()).toBe('# Trang đầu\n\n:::pagebreak\n:::\n');
        muya.undo();
        expect(muya.getMarkdown()).toBe('# Trang đầu\n');
        muya.destroy();
    });

    it('inserts a page break with a focused writable paragraph as one undoable edit', async () => {
        const host = document.createElement('section');
        document.body.append(host);
        const muya = new Muya(host, { frontMatter: true });
        muya.init();
        muya.setContent('# Trang đầu\n');

        expect(muya.insertTopLevelBlocks(1, [
            {
                name: 'lmx-directive',
                meta: { name: 'pagebreak', attributes: {} },
                children: [{ name: 'paragraph', text: '' }],
            },
            { name: 'paragraph', text: '' },
        ], 1)).toBe(true);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        expect(muya.getState().map(block => block.name)).toEqual([
            'atx-heading',
            'lmx-directive',
            'paragraph',
        ]);
        expect(muya.editor.activeContentBlock?.domNode?.closest('.mu-paragraph')).not.toBeNull();

        muya.undo();
        expect(muya.getMarkdown()).toBe('# Trang đầu\n');
        muya.destroy();
    });

    it('replaces a top-level page range as one undoable edit', async () => {
        const host = document.createElement('section');
        document.body.append(host);
        const muya = new Muya(host, { frontMatter: true });
        muya.init();
        muya.setContent('# Trang A\n\n:::pagebreak\n:::\n\n# Trang B\n');

        expect(muya.replaceTopLevelBlocks(0, 3, [
            { name: 'atx-heading', meta: { level: 1 }, text: '# Trang B' },
            {
                name: 'lmx-directive',
                meta: { name: 'pagebreak', attributes: {} },
                children: [{ name: 'paragraph', text: '' }],
            },
            { name: 'atx-heading', meta: { level: 1 }, text: '# Trang A' },
        ], 2)).toBe(true);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        expect(muya.getMarkdown()).toBe('# Trang B\n\n:::pagebreak\n:::\n\n# Trang A\n');
        expect(muya.editor.activeContentBlock?.domNode?.closest('[contenteditable="false"]')).toBeNull();
        expect(muya.editor.activeContentBlock?.text).toContain('Trang A');

        muya.undo();
        expect(muya.getMarkdown()).toBe('# Trang A\n\n:::pagebreak\n:::\n\n# Trang B\n');
        muya.destroy();
    });

    it('never restores a replacement caret into a hidden structural child', async () => {
        const host = document.createElement('section');
        document.body.append(host);
        const muya = new Muya(host, { frontMatter: true });
        muya.init();
        muya.setContent('# Nội dung\n\n:::pagebreak\n:::\n\n:::cover\n:::\n');

        expect(muya.replaceTopLevelBlocks(0, 3, [
            {
                name: 'lmx-directive',
                meta: { name: 'cover', attributes: {} },
                children: [{ name: 'paragraph', text: '' }],
            },
            {
                name: 'lmx-directive',
                meta: { name: 'pagebreak', attributes: {} },
                children: [{ name: 'paragraph', text: '' }],
            },
            { name: 'paragraph', text: '' },
        ], 2)).toBe(true);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

        const active = muya.editor.activeContentBlock;
        expect(active?.domNode?.closest('[contenteditable="false"]')).toBeNull();
        expect(active?.domNode?.closest('.mu-paragraph')).not.toBeNull();
        muya.destroy();
    });

    it.each([
        ['Nội dung.\n', 'paragraph'],
        ['# Tiêu đề\n', 'heading-1'],
        ['#### Chi tiết\n', 'heading-4'],
        ['Tiêu đề\n===\n', 'heading-1'],
    ])('wraps a standard %s block in one visible, undoable Quick Edit directive', async (
        source,
        component,
    ) => {
        const host = document.createElement('section');
        document.body.append(host);
        const muya = new Muya(host, { frontMatter: true });
        muya.init();
        muya.setContent(source);

        expect(muya.updateLmxDirectiveMetadata([0], {
            identifier: null,
            attributes: { component, color: '#A12424' },
        })).toBe(true);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

        expect(muya.getMarkdown()).toContain(
            `:::style {color="#A12424" component="${component}"}`,
        );
        expect(muya.canUndo()).toBe(true);
        muya.undo();
        expect(muya.getMarkdown()).toBe(source);
        muya.destroy();
    });

    it('rejects mismatched or unsupported standard Quick Edit targets without changing Markdown', () => {
        const host = document.createElement('section');
        document.body.append(host);
        const muya = new Muya(host, { frontMatter: true });
        muya.init();
        const source = 'Nội dung.\n\n```text\ncode\n```\n';
        muya.setContent(source);

        expect(muya.updateLmxDirectiveMetadata([0], {
            identifier: null,
            attributes: { component: 'heading-1', color: '#A12424' },
        })).toBe(false);
        expect(muya.updateLmxDirectiveMetadata([1], {
            identifier: null,
            attributes: { component: 'listing', color: '#A12424' },
        })).toBe(false);
        expect(muya.updateLmxDirectiveMetadata([0], {
            identifier: 'hidden-id',
            attributes: { component: 'paragraph', color: '#A12424' },
        })).toBe(false);
        expect(muya.getMarkdown()).toBe(source);
        muya.destroy();
    });

    it('lets keyboard users select a structural placement card', () => {
        const host = document.createElement('section');
        document.body.append(host);
        const muya = new Muya(host, { frontMatter: true });
        const selections: unknown[] = [];
        muya.on('lmx-block-selected', selection => selections.push(selection));
        muya.init();

        muya.setContent(':::toc\n:::\n');

        const marker = document.querySelector<HTMLElement>('[data-lmx-name="toc"]');
        expect(marker?.tabIndex).toBe(0);
        marker?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(selections).toEqual([]);

        marker?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        marker?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        expect(selections).toMatchObject([
            { name: 'toc', identifier: null, attributes: {} },
            { name: 'toc', identifier: null, attributes: {} },
        ]);
        muya.destroy();
    });

    it.each([
        'cover',
        'toc',
        'list-of-figures',
        'list-of-tables',
        'pagebreak',
    ])('exits the %s structural block after pressing Enter twice', async (name) => {
        const host = document.createElement('section');
        document.body.append(host);
        const muya = new Muya(host, { frontMatter: true });
        muya.init();

        muya.setContent(`:::${name}\n:::\n`);

        const marker = document.querySelector<HTMLElement>(`[data-lmx-name="${name}"]`);
        marker?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(muya.getState().map(block => block.name)).toEqual(['lmx-directive']);

        marker?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        const blockNames = muya.getState().map(block => block.name);
        const activeBlockHost = muya.editor.activeContentBlock?.domNode?.closest('[data-lmx-name]');
        muya.destroy();

        expect(blockNames).toEqual(['lmx-directive', 'paragraph']);
        expect(activeBlockHost).toBeNull();
    });

    it('renders a page break through the host preview renderer', () => {
        const host = document.createElement('section');
        document.body.append(host);
        const renderedNames: string[] = [];
        const muya = new Muya(host, {
            frontMatter: true,
            structurePreviewRenderer({ name, container }) {
                renderedNames.push(name);
                container.textContent = name === 'pagebreak' ? 'NGẮT TRANG' : name;
            },
        });
        muya.init();

        muya.setContent(':::pagebreak\n:::\n');

        const marker = document.querySelector<HTMLElement>('[data-lmx-name="pagebreak"]');
        expect(renderedNames).toEqual(['pagebreak']);
        expect(marker?.getAttribute('contenteditable')).toBe('false');
        expect(marker?.querySelector('.mu-lmx-structure-preview')?.textContent).toBe('NGẮT TRANG');
        expect(muya.getMarkdown()).toBe(':::pagebreak\n:::\n');
        muya.destroy();
    });

    it('lets the host render a structural preview without exposing theme code in Muya', () => {
        const host = document.createElement('section');
        document.body.append(host);
        const renderedNames: string[] = [];
        const muya = new Muya(host, {
            frontMatter: true,
            structurePreviewRenderer({ name, container }) {
                renderedNames.push(name);
                const title = document.createElement('strong');
                title.textContent = 'Host cover preview';
                container.append(title);
            },
        });
        muya.init();

        muya.setContent(':::cover\n:::\n');

        const preview = document.querySelector<HTMLElement>('.mu-lmx-cover-preview');
        expect(renderedNames).toEqual(['cover']);
        expect(preview?.textContent).toBe('Host cover preview');
        muya.destroy();
    });
});
