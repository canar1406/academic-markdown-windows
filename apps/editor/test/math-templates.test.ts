import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import {
  createMathInsertion,
  findMathTemplates,
  getMathTemplate,
  listMathTemplates,
} from '../src/math-templates.js';

const reference = JSON.parse(readFileSync(
  new URL('./fixtures/math-reference-commands.json', import.meta.url), 'utf8',
)) as { commands: string[] };

// Exercise exactly the renderer/version shipped by Muya, not a second renderer.
const katex = createRequire(new URL('../../../packages/muya-fork/package.json', import.meta.url))('katex') as {
  renderToString(source: string, options: { displayMode: boolean; throwOnError: boolean; strict: string }): string;
};

describe('math template registry', () => {
  it('assigns one unique identity to every menu option', () => {
    const ids = listMathTemplates().map(template => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(listMathTemplates().map(template => ({ id: template.id, template })))(
    '$id creates valid math before and after filling its tab stops',
    ({ template }) => {
      for (const selected of [undefined, 'x+1']) {
        const insertion = template.create(selected);
        expect(insertion.text).not.toContain('\uFFFC');
        let filled = insertion.text;
        for (const stop of [...insertion.tabStops].reverse()) {
          expect(stop.from).toBeGreaterThanOrEqual(0);
          expect(stop.to).toBeGreaterThanOrEqual(stop.from);
          expect(stop.to).toBeLessThanOrEqual(insertion.text.length);
          filled = filled.slice(0, stop.from) + 'x' + filled.slice(stop.to);
        }
        for (const latex of [insertion.text, filled]) {
          expect(() => katex.renderToString(latex, { displayMode: true, throwOnError: true, strict: 'ignore' })).not.toThrow();
        }
      }
    },
  );

  it.each([
    ['dfrac', '\\dfrac{a}{b}'],
    ['tfrac', '\\tfrac{a}{b}'],
    ['dbinom', '\\dbinom{a}{b}'],
    ['tbinom', '\\tbinom{a}{b}'],
    ['cfrac', '\\cfrac{a}{b}'],
    ['binom', '\\binom{a}{b}'],
    ['double-integral', '\\iint_{a}^{b}'],
    ['triple-integral', '\\iiint_{a}^{b}'],
    ['bmatrix', '\\begin{bmatrix}\n  a & b \\\\\n  c & d\n\\end{bmatrix}'],
    ['determinant', '\\begin{vmatrix}\n  a & b \\\\\n  c & d\n\\end{vmatrix}'],
    ['derivative', '\\frac{d}{da}'],
    ['partial-derivative', '\\frac{\\partial a}{\\partial b}'],
    ['nth-derivative', '\\frac{d^a}{db^c}'],
    ['overset', '\\overset{a}{b}'],
    ['underset', '\\underset{a}{b}'],
    ['overbrace', '\\overbrace{a}^{b}'],
    ['underbrace', '\\underbrace{a}_{b}'],
  ])('%s tab stops target arguments or cells, never TeX syntax', (id, expected) => {
    const insertion = createMathInsertion(id);
    let actual = insertion.text;
    for (let index = insertion.tabStops.length - 1; index >= 0; index -= 1) {
      const { from, to } = insertion.tabStops[index];
      actual = actual.slice(0, from) + String.fromCharCode(97 + index) + actual.slice(to);
    }
    expect(actual).toBe(expected);
  });

  it('ranks common and exact command matches before incidental substring matches', () => {
    expect(findMathTemplates('f')[0]?.id).toBe('fraction');
    expect(findMathTemplates('<=')[0]?.id).toBe('relation-less-than-or-equal');
    expect(findMathTemplates('Rightarrow')[0]?.create().text).toBe('\\Rightarrow');
    expect(findMathTemplates('rightarrow')[0]?.create().text).toBe('\\rightarrow');
    expect(findMathTemplates('\\alpha')[0]?.id).toBe('greek-alpha');
    expect(findMathTemplates('dao ham rieng')[0]?.id).toBe('partial-derivative');
  });

  it.each([
    'Delta', 'Gamma', 'Lambda', 'Omega', 'Phi', 'Pi', 'Psi', 'Sigma', 'Theta',
    'Upsilon', 'Xi', 'delta', 'gamma', 'Rightarrow', 'rightarrow', 'in', 'lim', 'mod',
  ])('prioritizes the exact %s control sequence for slash queries without a backslash', (query) => {
    expect(findMathTemplates(query)[0]?.create().text.match(/^\\[A-Za-z]+/u)?.[0])
      .toBe(`\\${query}`);
  });

  it.each(['frac', '\\frac'])('does not confuse %s with a derivative that starts with frac', (query) => {
    expect(findMathTemplates(query)[0]?.create().text).toBe('\\frac{}{}');
  });

  it.each(['int', '\\int'])('does not confuse %s with a repeated-integral compatibility expansion', (query) => {
    const insertion = findMathTemplates(query)[0]?.create().text;
    expect(insertion?.match(/\\[A-Za-z]+/gu)).toEqual(['\\int']);
  });

  it('covers the PDF baseline categories and common A-Z commands', () => {
    const required = [
      'dfrac',
      'cfrac',
      'binom',
      'derivative',
      'partial-derivative',
      'double-integral',
      'line-integral',
      'gradient',
      'divergence',
      'curl',
      'laplacian',
      'cases',
      'bmatrix',
      'determinant',
      'aligned',
      'substack',
      'boxed',
      'overbrace',
      'mathbb',
      'mathcal',
      'mathscr',
      'greek-omega',
      'operator-rank',
      'arrow-long-right',
      'logic-forall',
      'set-empty',
    ];
    const ids = new Set(listMathTemplates().map((template) => template.id));
    for (const id of required) expect(ids).toContain(id);
    expect(findMathTemplates('đạo hàm riêng').map((template) => template.id)).toContain(
      'partial-derivative',
    );
    expect(findMathTemplates('ma trận vuông').map((template) => template.id)).toContain(
      'bmatrix',
    );
  });

  it.each(reference.commands)('finds the exact %s command without changing its meaning', (command) => {
    const template = findMathTemplates(command)[0];
    expect(template, command).toBeDefined();
    const insertion = template!.create().text;
    const compatible: Record<string, string> = {
      '\\idotsint': '\\int\\cdots\\int',
      '\\iiiint': '\\int\\!\\int\\!\\int\\!\\int',
    };
    if (compatible[command]) expect(insertion).toBe(compatible[command]);
    else expect(insertion.match(/\\[A-Za-z]+/gu) ?? []).toContain(command);
  });

  it('preserves the original matrix shortcut and exposes the bare variant separately', () => {
    expect(createMathInsertion('matrix').text).toContain('\\begin{pmatrix}');
    expect(createMathInsertion('bare-matrix').text).toContain('\\begin{matrix}');
  });

  it('lists deterministic templates and finds Vietnamese aliases', () => {
    const ids = listMathTemplates().map((template) => template.id);
    expect(ids).toEqual([...ids].sort());
    expect(findMathTemplates('hệ phương trình').map((template) => template.id)).toContain(
      'aligned-system',
    );
  });

  it('creates clean LaTeX with ordered empty tab stops', () => {
    const insertion = createMathInsertion('fraction');

    expect(insertion.text).toBe('\\frac{}{}');
    expect(insertion.text).not.toMatch(/__|\{\{|\}\}/);
    expect(insertion.tabStops).toEqual([
      { from: 6, to: 6 },
      { from: 8, to: 8 },
    ]);
    expect(insertion.activeTabStop).toEqual({ from: 6, to: 6 });
  });

  it('wraps selected math without losing the next editable stop', () => {
    const insertion = createMathInsertion('square-root', { selectedText: 'x+1' });

    expect(insertion.text).toBe('\\sqrt{x+1}');
    expect(insertion.tabStops).toEqual([{ from: 9, to: 9 }]);
    expect(insertion.activeTabStop).toEqual({ from: 9, to: 9 });
  });

  it('emits single-backslash control sequences for nested commands', () => {
    expect(createMathInsertion('brackets', { selectedText: 'x' }).text).toBe('\\left(x\\right)');
    expect(createMathInsertion('limit').text).toBe('\\lim_{x \\to }');
  });

  it('creates a two-row system with tab stops in source order', () => {
    const insertion = createMathInsertion('aligned-system');

    expect(insertion.text).toBe('\\begin{cases}\n  {} \\\\\n  {}\n\\end{cases}');
    expect(insertion.tabStops).toEqual([
      { from: 16, to: 18 },
      { from: 24, to: 26 },
    ]);
  });

  it('keeps indexed roots and limit operators inside their argument braces', () => {
    expect(createMathInsertion('indexed-root')).toEqual({
      text: '\\sqrt[{}]{}',
      tabStops: [{ from: 7, to: 7 }, { from: 10, to: 10 }],
      activeTabStop: { from: 7, to: 7 },
    });
    expect(createMathInsertion('summation').tabStops).toEqual([
      { from: 6, to: 7 },
      { from: 10, to: 11 },
    ]);
    expect(createMathInsertion('product').tabStops).toEqual([
      { from: 7, to: 8 },
      { from: 11, to: 12 },
    ]);
  });

  it('provides required subscript and common symbol templates', () => {
    expect(createMathInsertion('subscript', { selectedText: 'x' }).text).toBe('x_{ }');
    expect(createMathInsertion('greek-alpha').text).toBe('\\alpha');
  });

  it('wraps Vietnamese prose in an allowlisted text command with one editable stop', () => {
    expect(createMathInsertion('text', { selectedText: 'hội tụ đều' })).toEqual({
      text: '\\text{hội tụ đều}',
      tabStops: [{ from: 16, to: 16 }],
      activeTabStop: { from: 16, to: 16 },
    });
    expect(createMathInsertion('text')).toEqual({
      text: '\\text{}',
      tabStops: [{ from: 6, to: 6 }],
      activeTabStop: { from: 6, to: 6 },
    });
    expect(findMathTemplates('văn bản').map((template) => template.id)).toContain('text');
    expect(findMathTemplates('chữ').map((template) => template.id)).toContain('text');
    expect(findMathTemplates('hoi tu').map((template) => template.id)).toContain('text');
    expect(findMathTemplates('hội tụ').map((template) => template.id)).toContain('text');
  });

  it('creates valid relation operators from symbolic and Vietnamese searches', () => {
    const relations = [
      ['relation-equals', '='],
      ['relation-less-than-or-equal', '\\le'],
      ['relation-greater-than-or-equal', '\\ge'],
      ['relation-not-equal', '\\ne'],
      ['relation-less-than', '<'],
      ['relation-greater-than', '>'],
      ['relation-approximately-equal', '\\approx'],
      ['relation-equivalent', '\\equiv'],
      ['relation-element-of', '\\in'],
      ['relation-not-element-of', '\\notin'],
      ['relation-subset', '\\subset'],
      ['relation-superset', '\\supset'],
    ] as const;

    for (const [id, latex] of relations) {
      expect(createMathInsertion(id)).toEqual({ text: latex, tabStops: [], activeTabStop: null });
      expect(getMathTemplate(id).category).toBe('relations');
    }
    expect(findMathTemplates('<=').map((template) => template.id)).toContain(
      'relation-less-than-or-equal',
    );
    expect(findMathTemplates('bé hơn hoặc bằng').map((template) => template.id)).toContain(
      'relation-less-than-or-equal',
    );
    expect(findMathTemplates('>=').map((template) => template.id)).toContain(
      'relation-greater-than-or-equal',
    );
    expect(findMathTemplates('lớn hơn hoặc bằng').map((template) => template.id)).toContain(
      'relation-greater-than-or-equal',
    );
    expect(findMathTemplates('khác').map((template) => template.id)).toContain('relation-not-equal');
    expect(findMathTemplates('xấp xỉ').map((template) => template.id)).toContain(
      'relation-approximately-equal',
    );
    expect(findMathTemplates('thuộc').map((template) => template.id)).toContain(
      'relation-element-of',
    );
    expect(findMathTemplates('không thuộc').map((template) => template.id)).toContain(
      'relation-not-element-of',
    );
    expect(createMathInsertion('relation-less-than-or-equal').text).not.toBe('<=');
  });

  it('rejects unknown templates with a useful error', () => {
    expect(() => getMathTemplate('does-not-exist')).toThrow('Unknown math template');
  });
});
