import { describe, expect, it } from 'vitest';
import {
  parseLmx,
  getLmxDefinition,
  hasQuickStyleOverride,
  listLmxInsertCommands,
  listLmxDefinitions,
  serializeLmxDirective,
  serializeLmxDocument,
  validateQuickStyleAttributes,
  type LmxDirectiveNode,
} from '../src/index.js';

describe('LMX v1 directives', () => {
  it('parses theorem metadata and Vietnamese body text', () => {
    const source = [
      ':::theorem {#thm-bayes title="Định lý Bayes"}',
      'Với hai biến cố $A$ và $B$ ...',
      ':::',
      '',
    ].join('\n');

    const result = parseLmx(source);

    expect(result.diagnostics).toEqual([]);
    expect(result.directives).toHaveLength(1);
    expect(result.directives[0]).toMatchObject({
      name: 'theorem',
      identifier: 'thm-bayes',
      attributes: { title: 'Định lý Bayes' },
      content: 'Với hai biến cố $A$ và $B$ ...\n',
      startLine: 1,
      endLine: 3,
    });
  });

  it('does not close a listing on directive markers inside a code fence', () => {
    const source = [
      ':::listing {#lst-example language="text"}',
      '```text',
      ':::',
      '```',
      ':::',
      '',
    ].join('\n');

    const result = parseLmx(source);

    expect(result.diagnostics).toEqual([]);
    expect(result.directives[0]?.content).toBe('```text\n:::\n```\n');
    expect(result.directives[0]?.endLine).toBe(5);
  });

  it('parses nested directives using a stack', () => {
    const source = [
      ':::front-section {kind="abstract"}',
      'Mở đầu',
      ':::theorem {#thm-1}',
      'Nội dung',
      ':::',
      ':::',
    ].join('\n');

    const result = parseLmx(source);

    expect(result.diagnostics).toEqual([]);
    expect(result.directives[0]?.children[0]).toMatchObject({
      name: 'theorem',
      identifier: 'thm-1',
    });
  });

  it('keeps malformed input byte-for-byte recoverable', () => {
    const source = ':::figure {#fig-a caption="Thiếu đóng"}\n![Ảnh](a.png)\n';

    const result = parseLmx(source);

    expect(result.diagnostics[0]?.code).toBe('lmx.unterminated-directive');
    expect(serializeLmxDocument(result)).toBe(source);
  });

  it('serializes a semantic directive deterministically', () => {
    const node: LmxDirectiveNode = {
      kind: 'directive',
      name: 'figure',
      identifier: 'fig-system',
      attributes: { width: 0.8, caption: 'Kiến trúc', placement: 'h!' },
      content: '![Kiến trúc](assets/system.png)\n',
      children: [],
      startLine: 0,
      endLine: 0,
      raw: '',
    };

    expect(serializeLmxDirective(node)).toBe([
      ':::figure {#fig-system caption="Kiến trúc" placement="h!" width=0.8}',
      '![Kiến trúc](assets/system.png)',
      ':::',
      '',
    ].join('\n'));
  });

  it('registers the complete directive set, including the authored layout marker', () => {
    expect(listLmxDefinitions().map((item) => item.name)).toEqual([
      'theme-layout',
      'cover', 'toc', 'list-of-figures', 'list-of-tables', 'references', 'pagebreak',
      'theorem', 'definition', 'proof', 'remark',
      'property', 'proposition', 'corollary', 'lemma', 'exercise', 'figure',
      'table', 'equation', 'algorithm', 'listing', 'front-section', 'appendix', 'style',
    ]);
    expect(getLmxDefinition('theme-layout')?.template).toBe(':::theme-layout {node="section-id"}\n:::\n');
    expect(getLmxDefinition('figure')?.template).toContain(':::figure {#fig-label');
  });

  it('exposes every HCMUT template block as a distinct insert command', () => {
    const commands = listLmxInsertCommands();

    expect(commands.map((command) => command.id)).toEqual([
      'cover', 'toc', 'list-of-figures', 'list-of-tables', 'references',
      'figure', 'table', 'equation', 'algorithm', 'listing',
      'theorem', 'definition', 'proof', 'remark',
      'property', 'proposition', 'corollary', 'lemma',
      'exercise', 'pagebreak', 'acknowledgements', 'declaration', 'abstract', 'appendix',
    ]);
    expect(commands.find((command) => command.id === 'acknowledgements')?.template)
      .toContain('kind="acknowledgements"');
    expect(commands.find((command) => command.id === 'declaration')?.template)
      .toContain('kind="declaration"');
    expect(commands.find((command) => command.id === 'abstract')?.template)
      .toContain('kind="abstract"');

    const theoremCommands = commands.filter((command) => (
      ['theorem', 'property', 'proposition', 'corollary', 'lemma', 'exercise'].includes(command.id)
    ));
    expect(theoremCommands.every((command) => !command.template.includes('title='))).toBe(true);
    const identifiers = theoremCommands.map((command) => /\{#([^ }]+)/.exec(command.template)?.[1]);
    expect(new Set(identifiers).size).toBe(theoremCommands.length);
  });

  it('registers document structure placement blocks', () => {
    expect(['cover', 'toc', 'list-of-figures', 'list-of-tables'].map((name) => (
      getLmxDefinition(name)?.category
    ))).toEqual(['structure', 'structure', 'structure', 'structure']);

    expect(listLmxInsertCommands().map((command) => command.id)).toEqual(expect.arrayContaining([
      'cover', 'toc', 'list-of-figures', 'list-of-tables',
    ]));
  });

  it('registers Quick Edit style as a transparent non-slash wrapper', () => {
    expect(getLmxDefinition('style')).toMatchObject({
      category: 'style',
      transparent: true,
    });
    expect(listLmxInsertCommands().map((command) => command.id)).not.toContain('style');
  });

  it('derives Custom provenance from every shared Quick Edit property', () => {
    expect(hasQuickStyleOverride({ component: 'theorem' })).toBe(false);
    expect(hasQuickStyleOverride({ background: '#FFFFFF' })).toBe(true);
    expect(hasQuickStyleOverride({ paddingMm: 4 })).toBe(true);
    expect(hasQuickStyleOverride({ theme: 'formal' })).toBe(true);
  });

  it('validates supported Quick Edit properties and preserves unknown attributes as warnings', () => {
    expect(validateQuickStyleAttributes({
      component: 'paragraph',
      color: '#1E4B8F',
      fontSizePt: 12,
      align: 'center',
      futureProperty: 'keep-me',
    })).toEqual({
      valid: true,
      errors: [],
      warnings: ['Unknown Quick Edit style property is preserved: futureProperty.'],
      attributes: {
        component: 'paragraph',
        color: '#1E4B8F',
        fontSizePt: 12,
        align: 'center',
      },
    });
    expect(validateQuickStyleAttributes({ color: 'red; background:url(x)', fontSizePt: -2 }).errors)
      .toEqual([
        'Quick Edit color must be a hexadecimal color.',
        'Quick Edit fontSizePt must be between 4 and 144.',
      ]);
  });

  it('accepts the complete typed Quick Style Pro property contract', () => {
    const attributes = {
      component: 'theorem',
      theme: 'formal_v2',
      color: '#1E4B8F',
      background: '#F4F7FC',
      titleColor: '#244A73',
      fontFamily: 'serif',
      fontSizePt: 12,
      fontWeight: '700',
      fontStyle: 'italic',
      lineHeight: 1.4,
      letterSpacingPt: 0.25,
      titleFontFamily: 'sans-serif',
      titleFontSizePt: 14,
      titleFontWeight: '600',
      titleFontStyle: 'normal',
      titleLineHeight: 1.2,
      titleLetterSpacingPt: 0,
      align: 'justify',
      borderColor: '#244A73',
      borderWidthPt: 1.5,
      borderRadiusPt: 4,
      paddingMm: 3,
      marginMm: 6,
    } as const;

    expect(validateQuickStyleAttributes(attributes)).toEqual({
      valid: true,
      errors: [],
      warnings: [],
      attributes,
    });
  });

  it('rejects unsafe tokens, incorrect types, and out-of-range Quick Style values', () => {
    const validation = validateQuickStyleAttributes({
      component: 'theorem}\\input{evil',
      theme: '../formal',
      color: '#FFF',
      background: 'url(javascript:evil)',
      titleColor: 'rgb(0,0,0)',
      fontFamily: '\\input{evil}',
      fontSizePt: 145,
      fontWeight: 650,
      fontStyle: 'oblique}\\evil',
      lineHeight: 0,
      letterSpacingPt: 20.1,
      titleFontFamily: true,
      titleFontSizePt: 3,
      titleFontWeight: 1000,
      titleFontStyle: false,
      titleLineHeight: 5,
      titleLetterSpacingPt: -10.1,
      align: '\\centering',
      borderColor: 'red',
      borderWidthPt: -1,
      borderRadiusPt: 101,
      paddingMm: -0.1,
      marginMm: 101,
    });

    expect(validation.valid).toBe(false);
    expect(validation.attributes).toEqual({});
    expect(validation.errors).toHaveLength(23);
    expect(validation.errors).toEqual(expect.arrayContaining([
      'Quick Edit component must be a safe component token.',
      'Quick Edit theme must be a safe theme alias.',
      'Quick Edit fontWeight must be one of 400, 500, 600, or 700.',
      'Quick Edit lineHeight must be between 0.8 and 4.',
      'Quick Edit borderWidthPt must be between 0 and 24.',
      'Quick Edit paddingMm must be between 0 and 100.',
    ]));
  });

  it('accepts the professional inspector range boundaries', () => {
    expect(validateQuickStyleAttributes({
      fontWeight: '400',
      titleFontWeight: '700',
      lineHeight: 0.8,
      titleLineHeight: 4,
      letterSpacingPt: -10,
      titleLetterSpacingPt: 20,
      borderWidthPt: 24,
      borderRadiusPt: 100,
      marginMm: 100,
      paddingMm: 100,
    })).toMatchObject({ valid: true, errors: [], warnings: [] });
  });

  it('preserves unknown attributes while excluding them from the validated style contract', () => {
    const attributes = {
      component: 'paragraph',
      color: '#1E4B8F',
      futureProperty: 'keep-me',
    } as const;

    expect(validateQuickStyleAttributes(attributes)).toEqual({
      valid: true,
      errors: [],
      warnings: ['Unknown Quick Edit style property is preserved: futureProperty.'],
      attributes: {
        component: 'paragraph',
        color: '#1E4B8F',
      },
    });
    expect(attributes.futureProperty).toBe('keep-me');
  });

  it('round-trips a visible Quick Edit style wrapper deterministically', () => {
    const parsed = parseLmx([
      ':::style {component="paragraph" color="#1E4B8F" fontSizePt=12 align="center"}',
      'Nội dung.',
      ':::',
      '',
    ].join('\n'));
    expect(parsed.diagnostics).toEqual([]);
    expect(serializeLmxDirective(parsed.directives[0]!)).toBe([
      ':::style {align="center" color="#1E4B8F" component="paragraph" fontSizePt=12}',
      'Nội dung.',
      ':::',
      '',
    ].join('\n'));
  });
});
