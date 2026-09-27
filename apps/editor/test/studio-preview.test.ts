// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createEnvelope, type BridgeEnvelope } from '@markdown/bridge-protocol';
import { parseFrontMatter, parseLmx } from '@markdown/document-core';
import { exportMarkdownToLatex } from '@markdown/latex-exporter';
import { hcmutReportTheme } from '@markdown/theme-hcmut-report-v1';
import { Muya } from '@markdown/muya-core';
import prism, { loadedLanguages } from '@markdown/muya-core/utils/prism/index.js';
import type { ThemeSceneNode, ThemeSceneV2 } from '@markdown/theme-engine';
import { installBridge } from '../src/bridge';
import { projectThemeSceneToMarkdown } from '../src/studio-preview';

// The test has no server for Muya's lazy Prism grammar loader.
const originalYaml = prism.languages.yaml;
const yamlWasLoaded = loadedLanguages.has('yaml');
beforeAll(() => { prism.languages.yaml = prism.languages.markup; loadedLanguages.add('yaml'); });
afterAll(() => {
  if (originalYaml) prism.languages.yaml = originalYaml;
  else delete prism.languages.yaml;
  if (!yamlWasLoaded) loadedLanguages.delete('yaml');
});

function node(widget: string, properties: ThemeSceneNode['properties'] = {}, style: ThemeSceneNode['style'] = {}, children: ThemeSceneNode[] = []): ThemeSceneNode {
  return { id: widget, widget, version: 1, properties, style, children };
}
function scene(children: ThemeSceneNode[]): ThemeSceneV2 {
  return {
    schemaVersion: 2, page: { size: 'A4', widthMm: 210, heightMm: 297 },
    tokens: { ink: { type: 'color', value: '#202124' }, body: { type: 'length', value: 11, unit: 'pt' } },
    variants: {}, bindings: [], root: node('page', {}, {}, children),
  };
}
afterEach(() => { delete window.markdownEditor; delete window.webkit; });

describe('bounded Theme Studio preview projection', () => {
  it('exports a blank authored snapshot and a literal cover without HCMUT inheritance', () => {
    const blank = projectThemeSceneToMarkdown(scene([]), 'Independent');
    expect(blank.diagnostics.filter(item => item.severity === 'error')).toEqual([]);
    expect(parseFrontMatter(blank.markdown).data.lmx).toMatchObject({
      authoredTheme: { schemaVersion: 1, scene: scene([]) }, structure: { cover: false },
    });
    expect(parseFrontMatter(blank.markdown).body.trim()).toBe('');
    const blankExport = exportMarkdownToLatex(blank.markdown, hcmutReportTheme);
    expect(blankExport.latex).not.toContain('\\begin{titlepage}');
    expect(blankExport.latex).not.toMatch(/HCMUT|Bách Khoa|hcmut\.png/);

    const input = scene([node('cover', {
      title: 'Bìa do tôi tạo', university: 'Đại học riêng', supervisor: 'Nguyễn Ánh',
    }, { color: '#8A2145', fontSizePt: 14 })]);
    const preview = projectThemeSceneToMarkdown(input);
    const exported = exportMarkdownToLatex(preview.markdown, hcmutReportTheme);
    expect(exported.diagnostics.filter(item => item.severity === 'error')).toEqual([]);
    expect(exported.latex).toContain('\\begin{titlepage}');
    expect(exported.latex).toContain('Bìa do tôi tạo');
    expect(exported.latex).toContain('Đại học riêng');
    expect(exported.latex).toContain('Nguyễn Ánh');
    expect(exported.latex).toContain('\\fontsize{14}');
    expect(exported.latex).not.toMatch(/HCMUT|BÁCH KHOA|hcmut\.png|tikzpicture/);
    expect(exported.assetPaths).toEqual([]);
    expect(projectThemeSceneToMarkdown(input)).toEqual(preview);
  });
  it('starts at the top and preserves the preview scroll when a native style edit reloads the sample', async () => {
    const stage = document.createElement('div');
    stage.className = 'editor-stage';
    const host = document.createElement('section');
    stage.append(host); document.body.append(stage);
    let markdown = '';
    installBridge({
      setContent: value => { markdown = value; stage.scrollTop = 999; },
      getMarkdown: () => markdown,
      on: () => {},
      visualContainer: host,
    });
    try {
      window.markdownEditor?.handleEnvelope(createEnvelope('studio.previewScene', 'initial', { scene: scene([]) }));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      expect(stage.scrollTop).toBe(0);
      stage.scrollTop = 120;
      window.markdownEditor?.handleEnvelope(createEnvelope('studio.previewScene', 'edit', { scene: scene([]) }));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      expect(stage.scrollTop).toBe(120);
    } finally { window.dispatchEvent(new Event('pagehide')); stage.remove(); }
  });
  it('accepts shared empty collections from the native Foundation bridge without treating them as cycles', () => {
    const input = scene([node('paragraph', { text: 'Mẫu tiếng Việt' })]);
    // Foundation canonicalizes empty NSArray/NSDictionary instances. WebKit
    // can preserve those aliases when converting structured native arguments.
    const emptyObject = {};
    const emptyArray: [] = [];
    input.variants = emptyObject;
    input.root.style = emptyObject;
    input.root.children[0]!.style = emptyObject;
    input.root.children[0]!.children = emptyArray;
    input.bindings = emptyArray;
    expect(projectThemeSceneToMarkdown(input).diagnostics.filter(item => item.severity === 'error')).toEqual([]);
    expect(projectThemeSceneToMarkdown(input).markdown).toContain('Mẫu tiếng Việt');
  });
  it('keeps Vietnamese text and directive/HTML/TeX-looking literals as data; rejects unsupported content widgets', () => {
    const attack = 'Tiếng Việt\n:::\n:::pagebreak\n<script>![](https://evil.test/a) $x$ &';
    const result = projectThemeSceneToMarkdown(scene([
      node('heading', { title: attack, level: 2 }),
      node('paragraph', { text: attack }),
      node('theorem', { title: 'Định lý "A"', text: attack }),
    ]), attack);
    expect(result.markdown).not.toBe('');
    expect(parseFrontMatter(result.markdown).valid).toBe(true);
    expect(parseLmx(parseFrontMatter(result.markdown).body).diagnostics).toEqual([]);
    const exported = exportMarkdownToLatex(result.markdown, hcmutReportTheme);
    expect(exported.diagnostics.filter(item => item.severity === 'error')).toEqual([]);
    expect(exported.assetPaths).toEqual([]);
    expect(exported.latex).not.toContain('\\input{/etc/passwd}');
    expect(exported.latex).toContain('Tiếng Việt');
    for (const unsupported of [
      node('listing', { code: '~~~\n```\n:::pagebreak\nprint("Xin chào")' }),
      node('math', { formula: '\\input{/etc/passwd}' }),
      node('table', { title: 'A|B', text: attack }),
    ]) {
      const rejected = projectThemeSceneToMarkdown(scene([unsupported]));
      expect(rejected.markdown).toBe('');
      expect(rejected.diagnostics.some(item => item.severity === 'error' && item.message.includes(unsupported.widget))).toBe(true);
    }
  });

  it('resolves native typography tokens and rejects unsupported partial styles instead of silently dropping them', () => {
    const input = scene([node('body', {}, { color: { token: 'ink' } }, [
      node('heading', { title: 'A *safe* title', alignment: 'center', level: 1 }, { accent: { token: 'ink' } }),
      node('paragraph', { text: 'Nội dung' }, { fontSizePt: { token: 'body' } }),
    ])]);
    input.tokens.space = { type: 'length', value: 2, unit: 'mm' };
    const result = projectThemeSceneToMarkdown(input);
    expect(result.markdown).toContain('color="#202124"');
    expect(result.markdown).toContain('fontSizePt=11');
    expect(result.markdown).toContain('align="center"');
    expect(result.markdown).not.toContain('display:none');
    expect(projectThemeSceneToMarkdown(input)).toEqual(result);
    input.root.children[0]!.children[1]!.style.customCSS = 'display:none';
    const rejected = projectThemeSceneToMarkdown(input);
    expect(rejected.markdown).toBe('');
    expect(rejected.diagnostics.some(item => item.severity === 'error' && item.message.includes('customCSS'))).toBe(true);
  });

  it('rejects invalid/beyond-budget scenes and warns rather than inventing unsupported widgets', () => {
    expect(projectThemeSceneToMarkdown({ ...scene([]), schemaVersion: 1 }).markdown).toBe('');
    const cyclic = scene([]); cyclic.root.children.push(cyclic.root);
    expect(projectThemeSceneToMarkdown(cyclic).diagnostics[0]?.severity).toBe('error');
    const result = projectThemeSceneToMarkdown(scene([node('image', { src: 'private.png' }), node('unknown') ]));
    expect(result.markdown).not.toContain('private.png');
    expect(result.markdown).not.toContain('Sample unknown');
    expect(result.diagnostics.some(item => item.message.includes('image'))).toBe(true);
    expect(result.diagnostics.some(item => item.message.includes('unknown'))).toBe(true);
  });

  it('loads a read-only real Muya sample, preserves scroll, and exports with revision zero and correlated acknowledgements', async () => {
    const host = document.createElement('section'); document.body.append(host);
    const sourceButton = document.createElement('button'); sourceButton.id = 'mode-source';
    document.body.append(sourceButton);
    const muya = new Muya(host, { frontMatter: true }); muya.init();
    const messages: BridgeEnvelope[] = [];
    window.webkit = { messageHandlers: { bridge: { postMessage: message => messages.push(message) } } };
    try {
      let modeChanges = 0;
      installBridge({
        setContent: markdown => muya.setContent(markdown),
        getMarkdown: () => muya.getMarkdown(), on: () => {},
        visualContainer: muya.domNode,
        setMode: () => { modeChanges += 1; },
      });
      const input = scene([
        node('cover', { title: 'Bìa mẫu', university: 'Đại học' }),
        node('header', { title: 'Trường mẫu' }), node('footer', { title: 'Chân trang' }),
        node('body', {}, {}, [node('heading', { title: 'A *safe* title', level: 1 }, { accent: { token: 'ink' } }), node('paragraph', { text: 'Nội dung mẫu' })]),
        node('page-number', { format: 'current-total' }),
      ]);
      window.markdownEditor?.handleEnvelope(createEnvelope('studio.previewScene', 'scene-42', { scene: input, title: 'Theme name' }));
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(muya.domNode.querySelector('[data-lmx-name="style"]')).not.toBeNull();
      expect(muya.domNode.querySelector('[contenteditable="true"]')).toBeNull();
      expect(sourceButton.hidden).toBe(true);
      // Simulate a Muya rerender reintroducing an editable descendant.
      const editable = document.createElement('div');
      editable.setAttribute('contenteditable', 'true');
      muya.domNode.append(editable);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(editable.getAttribute('contenteditable')).toBe('false');
      for (const type of ['beforeinput', 'paste', 'cut', 'drop']) {
        const event = new Event(type, { bubbles: true, cancelable: true });
        editable.dispatchEvent(event);
        expect(event.defaultPrevented, type).toBe(true);
      }
      for (const key of ['a', 'Backspace', 'Enter']) {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        editable.dispatchEvent(event);
        expect(event.defaultPrevented, key).toBe(true);
      }
      const wheel = new WheelEvent('wheel', { deltaY: 50, bubbles: true, cancelable: true });
      editable.dispatchEvent(wheel);
      expect(wheel.defaultPrevented).toBe(false);
      const pageDown = new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true });
      editable.dispatchEvent(pageDown);
      expect(pageDown.defaultPrevented).toBe(false);
      editable.remove();
      window.markdownEditor?.setMode('source');
      window.markdownEditor?.handleEnvelope(createEnvelope('editor.setMode', null, { mode: 'source' }));
      expect(modeChanges).toBe(0);
      const source = muya.getMarkdown();
      const expected = exportMarkdownToLatex(source, hcmutReportTheme);
      expect(expected.latex).toContain('Bìa mẫu');
      expect(expected.latex).toContain('Trường mẫu');
      expect(expected.latex).toContain('Chân trang');
      expect(expected.latex).toContain('\\thepage/\\pageref{LastPage}');
      expect(expected.latex).toContain('A *safe* title');
      expect(expected.latex).not.toMatch(/hcmut\.png|Bách Khoa/);
      expect(expected.latex).toContain('\\begin{titlepage}');
      expect(expected.diagnostics.filter(item => item.severity === 'error')).toEqual([]);
      window.markdownEditor?.handleEnvelope(createEnvelope('export.requestLatex', 'pdf-42'));
      expect(messages).toContainEqual(expect.objectContaining({ type: 'studio.previewRendered', requestId: 'scene-42' }));
      expect(messages).toContainEqual(expect.objectContaining({ type: 'export.latex', requestId: 'pdf-42', payload: expect.objectContaining({ latex: expected.latex, revision: 0 }) }));
      expect(messages.some(message => message.type === 'document.changed')).toBe(false);
      window.markdownEditor?.updateMetadata({ lmx: { cover: { title: 'Must not change' } } });
      window.markdownEditor?.handleEnvelope(createEnvelope('document.updateMetadata', null, { patch: { lmx: { cover: { title: 'Must not change' } } } }));
      expect(muya.getMarkdown()).toBe(source);
      window.markdownEditor?.handleEnvelope(createEnvelope('studio.previewScene', 'invalid', { scene: {} }));
      expect(muya.getMarkdown()).toBe(source);
      expect(messages.at(-1)).toMatchObject({
        type: 'studio.previewRendered',
        requestId: 'invalid',
        payload: { diagnostics: expect.arrayContaining([expect.objectContaining({ severity: 'error' })]) },
      });
    } finally {
      window.dispatchEvent(new Event('pagehide'));
      muya.destroy(); host.remove(); sourceButton.remove();
    }
  });
});
