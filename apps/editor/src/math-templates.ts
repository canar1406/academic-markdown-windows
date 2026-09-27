import { markdownMathReferenceCommands } from './math-reference-catalog.js';

export type MathTemplateCategory =
  | 'fractions-and-roots'
  | 'systems-and-matrices'
  | 'calculus'
  | 'symbols'
  | 'relations'
  | 'layout';

export interface MathTabStop {
  from: number;
  to: number;
}

export interface MathTemplate {
  id: string;
  title: string;
  aliases: string[];
  category: MathTemplateCategory;
  icon: string;
  create(selectedText?: string): MathInsertion;
}

export interface MathInsertion {
  text: string;
  tabStops: MathTabStop[];
  activeTabStop: MathTabStop | null;
}

export const featuredMathTemplateIds = [
  'fraction',
  'dfrac',
  'square-root',
  'indexed-root',
  'integral',
  'summation',
  'product',
  'limit',
  'derivative',
  'partial-derivative',
  'cases',
  'matrix',
  'aligned',
  'vector',
  'text',
  'greek-alpha',
] as const;

interface TemplateDefinition {
  id: string;
  title: string;
  aliases: string[];
  category: MathTemplateCategory;
  icon: string;
  build(selectedText?: string): MathInsertion;
}

const MATH_ICON = '∑';
const SELECTION_MARKER = '￼';

const definitions: TemplateDefinition[] = [
  definition('aligned-system', 'Hệ phương trình', ['system', 'he phuong trinh', 'hệ', 'cases'], 'systems-and-matrices', () => {
    const text = String.raw`\begin{cases}
  {} \\
  {}
\end{cases}`;
    return insertionWithStops(text, [
      offsetOf(String.raw`\begin{cases}
  `, 2),
      offsetOf(String.raw`\begin{cases}
  {} \\
  `, 2),
    ]);
  }),
  definition('brackets', 'Ngoặc nhóm', ['brackets', 'parentheses', 'ngoặc'], 'layout', (selected) => (
    wrapInsertion(String.raw`\left(${SELECTION_MARKER}\right)`, selected)
  )),
  definition('fraction', 'Phân số', ['frac', 'fraction', 'phân số', 'chia'], 'fractions-and-roots', () => (
    insertionWithStops(String.raw`\frac{}{}`, [{ from: 6, to: 6 }, { from: 8, to: 8 }])
  )),
  definition('greek-alpha', 'Alpha', ['alpha', 'anpha', 'α'], 'symbols', () => (
    insertionWithStops(String.raw`\alpha`, [])
  )),
  definition('greek-beta', 'Beta', ['beta', 'bêta', 'β'], 'symbols', () => (
    insertionWithStops(String.raw`\beta`, [])
  )),
  definition('greek-gamma', 'Gamma', ['gamma', 'gama', 'γ'], 'symbols', () => (
    insertionWithStops(String.raw`\gamma`, [])
  )),
  definition('indexed-root', 'Căn có chỉ số', ['indexed root', 'căn bậc n', 'nth root'], 'fractions-and-roots', (selected) => {
    const radicand = selected ?? '';
    const text = String.raw`\sqrt[{}]{${radicand}}`;
    const radicandStart = text.indexOf('{', text.indexOf(']') + 1) + 1;
    return insertionWithStops(text, [
      { from: 7, to: 7 },
      ...(selected ? [] : [{ from: radicandStart, to: radicandStart }]),
    ]);
  }),
  definition('integral', 'Tích phân', ['integral', 'tích phân'], 'calculus', () => (
    insertionWithStops(String.raw`\int_{}^{}`, [
      { from: 6, to: 6 },
      { from: 9, to: 9 },
    ])
  )),
  definition('limit', 'Giới hạn', ['limit', 'giới hạn'], 'calculus', () => (
    insertionWithStops(String.raw`\lim_{x \to }`, [{ from: 12, to: 12 }])
  )),
  definition('product', 'Tích', ['product', 'tích'], 'calculus', () => (
    insertionWithStops(String.raw`\prod_{ }^{ }`, [{ from: 7, to: 8 }, { from: 11, to: 12 }])
  )),
  definition('relation-approximately-equal', 'Xấp xỉ', ['approx', 'approximately equal', 'xấp xỉ', '≈'], 'relations', () => (
    insertionWithStops(String.raw`\approx`, [])
  )),
  definition('relation-element-of', 'Thuộc', ['element of', 'in', 'thuộc', '∈'], 'relations', () => (
    insertionWithStops(String.raw`\in`, [])
  )),
  definition('relation-equals', 'Bằng', ['equals', 'bằng', '='], 'relations', () => (
    insertionWithStops('=', [])
  )),
  definition('relation-equivalent', 'Tương đương', ['equiv', 'equivalent', 'tương đương', '≡'], 'relations', () => (
    insertionWithStops(String.raw`\equiv`, [])
  )),
  definition('relation-greater-than', 'Lớn hơn', ['greater than', 'lớn hơn', '>'], 'relations', () => (
    insertionWithStops('>', [])
  )),
  definition('relation-greater-than-or-equal', 'Lớn hơn hoặc bằng', ['ge', 'greater than or equal', 'lớn hơn hoặc bằng', '>=', '≥'], 'relations', () => (
    insertionWithStops(String.raw`\ge`, [])
  )),
  definition('relation-less-than', 'Bé hơn', ['less than', 'bé hơn', '<'], 'relations', () => (
    insertionWithStops('<', [])
  )),
  definition('relation-less-than-or-equal', 'Bé hơn hoặc bằng', ['le', 'less than or equal', 'bé hơn hoặc bằng', '<=', '≤'], 'relations', () => (
    insertionWithStops(String.raw`\le`, [])
  )),
  definition('relation-not-element-of', 'Không thuộc', ['not element of', 'notin', 'không thuộc', '∉'], 'relations', () => (
    insertionWithStops(String.raw`\notin`, [])
  )),
  definition('relation-not-equal', 'Khác', ['ne', 'not equal', 'khác', '≠'], 'relations', () => (
    insertionWithStops(String.raw`\ne`, [])
  )),
  definition('relation-subset', 'Tập con', ['subset', 'tập con', '⊂'], 'relations', () => (
    insertionWithStops(String.raw`\subset`, [])
  )),
  definition('relation-superset', 'Tập chứa', ['superset', 'tập chứa', '⊃'], 'relations', () => (
    insertionWithStops(String.raw`\supset`, [])
  )),
  definition('square-root', 'Căn bậc hai', ['sqrt', 'square root', 'căn', 'căn bậc hai'], 'fractions-and-roots', (selected) => (
    wrapInsertion(String.raw`\sqrt{${SELECTION_MARKER}}`, selected)
  )),
  definition('subscript', 'Chỉ số dưới', ['subscript', 'index', 'chỉ số dưới'], 'layout', (selected) => {
    const base = selected ?? '';
    return insertionWithStops(`${base}_{ }`, [{ from: base.length + 2, to: base.length + 3 }]);
  }),
  definition('summation', 'Tổng', ['sum', 'summation', 'tổng', 'sigma'], 'calculus', () => (
    insertionWithStops(String.raw`\sum_{ }^{ }`, [{ from: 6, to: 7 }, { from: 10, to: 11 }])
  )),
  definition('superscript', 'Số mũ', ['superscript', 'power', 'số mũ'], 'layout', (selected) => {
    const base = selected ?? '';
    return insertionWithStops(`${base}^{ }`, [{ from: base.length + 2, to: base.length + 3 }]);
  }),
  definition('text', 'Văn bản', ['text', 'văn bản', 'chữ', 'hoi tu', 'hội tụ'], 'layout', (selected) => (
    wrapInsertion(String.raw`\text{${SELECTION_MARKER}}`, selected)
  )),
  definition('vector', 'Vector', ['vector', 'vectơ', 'vec'], 'symbols', (selected) => (
    wrapInsertion(String.raw`\vec{${SELECTION_MARKER}}`, selected)
  )),
  ...pdfBaselineDefinitions(),
];

const templates = definitions
  .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  .map((definitionValue): MathTemplate => ({
    id: definitionValue.id,
    title: definitionValue.title,
    aliases: [...definitionValue.aliases].sort((left, right) => left.localeCompare(right, 'vi')),
    category: definitionValue.category,
    icon: definitionValue.icon,
    create: definitionValue.build,
  }));

export function listMathTemplates(): readonly MathTemplate[] {
  return templates;
}

export function getMathTemplate(id: string): MathTemplate {
  const template = templates.find((candidate) => candidate.id === id);
  if (!template) throw new Error(`Unknown math template: ${id}`);
  return template;
}

export function listFeaturedMathTemplates(): MathTemplate[] {
  return featuredMathTemplateIds.map(getMathTemplate);
}

export function findMathTemplates(query: string): MathTemplate[] {
  const trimmedQuery = query.trim();
  const rawQuery = trimmedQuery.replace(/^\\+/u, '');
  const normalized = normalize(rawQuery);
  if (normalized.length === 0) return [...templates];
  return templates
    .map((template) => ({
      template,
      score: templateMatchScore(template, rawQuery, normalized),
    }))
    .filter((entry) => entry.score < Number.POSITIVE_INFINITY)
    .sort((left, right) => left.score - right.score || left.template.id.localeCompare(right.template.id))
    .map((entry) => entry.template);
}

function templateMatchScore(
  template: MathTemplate,
  rawQuery: string,
  query: string,
): number {
  const rawFields = [template.id, template.title, ...template.aliases];
  if (
    template.id.startsWith('reference-')
    && template.aliases.includes(rawQuery)
    && /^[A-Z]/u.test(rawQuery)
  ) {
    return -1;
  }
  if (rawFields.some((field) => field === rawQuery)) return 0;
  if (
    firstControlSequence(template.create().text) === rawQuery
    && rawQuery.length > 1
  ) {
    return 1;
  }
  const fields = [
    normalize(template.id),
    normalize(template.title),
    ...template.aliases.map(normalize),
  ];
  if (fields.some((field) => field === query)) return 2;
  if (fields.some((field) => field.startsWith(query))) return 3;
  if (fields.some((field) => field.split(/[\s_-]+/u).some((word) => word.startsWith(query)))) return 4;
  if (fields.some((field) => field.includes(query))) return 5;
  return Number.POSITIVE_INFINITY;
}

function firstControlSequence(text: string): string | null {
  return text.match(/^\\([A-Za-z]+)/u)?.[1] ?? null;
}

export function createMathInsertion(
  id: string,
  options: { selectedText?: string } = {},
): MathInsertion {
  return getMathTemplate(id).create(options.selectedText);
}

function definition(
  id: string,
  title: string,
  aliases: string[],
  category: MathTemplateCategory,
  build: (selectedText?: string) => MathInsertion,
): TemplateDefinition {
  return { id, title, aliases, category, icon: MATH_ICON, build };
}

/**
 * The Math A-Z reference is a vocabulary contract, not just a list of three
 * demo snippets. Keep the common structures explicit so their arguments get
 * useful tab stops, and keep the remaining Core/AMS commands searchable and
 * insertable without teaching the editor a second math grammar.
 */
function pdfBaselineDefinitions(): TemplateDefinition[] {
  const simple = (
    id: string,
    command: string,
    title: string,
    category: MathTemplateCategory,
    aliases: string[] = [],
  ): TemplateDefinition => definition(
    id,
    title,
    [id, command.replace(/^\\/, ''), ...aliases],
    category,
    () => insertionWithStops(command, []),
  );
  const wrapped = (
    id: string,
    command: string,
    title: string,
    category: MathTemplateCategory,
    aliases: string[] = [],
  ): TemplateDefinition => definition(
    id,
    title,
    [id, command.replace(/^\\/, ''), ...aliases],
    category,
    (selected) => wrapInsertion(command, selected),
  );
  const argument = (
    id: string,
    text: string,
    title: string,
    category: MathTemplateCategory,
    stops: MathTabStop[],
    aliases: string[] = [],
  ): TemplateDefinition => definition(
    id,
    title,
    [id, ...aliases],
    category,
    () => insertionWithStops(text, stops.length > 0 ? stops : emptyGroupStops(text)),
  );
  const groupArgument = (
    id: string,
    text: string,
    title: string,
    category: MathTemplateCategory,
    aliases: string[] = [],
  ): TemplateDefinition => definition(
    id,
    title,
    [id, ...aliases],
    category,
    () => insertionWithStops(text, emptyGroupRanges(text)),
  );

  const result: TemplateDefinition[] = [
    argument('dfrac', String.raw`\dfrac{}{}`, 'Phân số hiển thị', 'fractions-and-roots', [
      { from: 7, to: 7 }, { from: 9, to: 9 },
    ], ['phân số lớn']),
    argument('tfrac', String.raw`\tfrac{}{}`, 'Phân số kiểu text', 'fractions-and-roots', [
      { from: 7, to: 7 }, { from: 9, to: 9 },
    ]),
    argument('cfrac', String.raw`\cfrac{}{}`, 'Phân số liên tục', 'fractions-and-roots', [
      { from: 7, to: 7 }, { from: 9, to: 9 },
    ]),
    argument('binom', String.raw`\binom{}{}`, 'Tổ hợp', 'fractions-and-roots', [
      { from: 7, to: 7 }, { from: 9, to: 9 },
    ], ['tổ hợp', 'nhị thức']),
    argument('dbinom', String.raw`\dbinom{}{}`, 'Tổ hợp hiển thị', 'fractions-and-roots', [
      { from: 8, to: 8 }, { from: 10, to: 10 },
    ]),
    argument('tbinom', String.raw`\tbinom{}{}`, 'Tổ hợp kiểu text', 'fractions-and-roots', [
      { from: 8, to: 8 }, { from: 10, to: 10 },
    ]),
    wrapped('absolute-value', String.raw`\left|${SELECTION_MARKER}\right|`, 'Giá trị tuyệt đối', 'layout', ['trị tuyệt đối']),
    wrapped('norm', String.raw`\left\|${SELECTION_MARKER}\right\|`, 'Chuẩn', 'layout', ['norm']),
    argument('derivative', String.raw`\frac{d}{dx}`, 'Đạo hàm', 'calculus', [{ from: 10, to: 11 }], ['đạo hàm']),
    argument('nth-derivative', String.raw`\frac{d^n}{dx^n}`, 'Đạo hàm bậc n', 'calculus', [
      { from: 8, to: 9 }, { from: 12, to: 13 }, { from: 14, to: 15 },
    ]),
    argument('partial-derivative', String.raw`\frac{\partial f}{\partial x}`, 'Đạo hàm riêng', 'calculus', [
      { from: 15, to: 16 }, { from: 27, to: 28 },
    ], ['đạo hàm riêng']),
    wrapped('gradient', String.raw`\nabla ${SELECTION_MARKER}`, 'Gradient', 'calculus', ['grad']),
    wrapped('divergence', String.raw`\nabla\cdot ${SELECTION_MARKER}`, 'Divergence', 'calculus', ['divergence']),
    wrapped('curl', String.raw`\nabla\times ${SELECTION_MARKER}`, 'Curl', 'calculus', ['xoáy']),
    wrapped('laplacian', String.raw`\nabla^2 ${SELECTION_MARKER}`, 'Laplacian', 'calculus', ['laplace']),
    argument('double-integral', String.raw`\iint_{}^{}`, 'Tích phân kép', 'calculus', [{ from: 7, to: 7 }, { from: 10, to: 10 }]),
    argument('triple-integral', String.raw`\iiint_{}^{}`, 'Tích phân ba', 'calculus', [{ from: 8, to: 8 }, { from: 11, to: 11 }]),
    wrapped('line-integral', String.raw`\oint_{${SELECTION_MARKER}}`, 'Tích phân đường', 'calculus', ['tích phân vòng']),
    argument('cases', String.raw`\begin{cases}
  {} & {} \\
  {} & {}
\end{cases}`, 'Hàm từng đoạn', 'systems-and-matrices', [], ['hàm từng đoạn']),
    groupArgument('pmatrix', String.raw`\begin{pmatrix}
  {} & {} \\
  {} & {}
\end{pmatrix}`, 'Ma trận tròn', 'systems-and-matrices'),
    groupArgument('bmatrix', String.raw`\begin{bmatrix}
  {} & {} \\
  {} & {}
\end{bmatrix}`, 'Ma trận vuông', 'systems-and-matrices', ['ma trận vuông']),
    groupArgument('matrix', String.raw`\begin{pmatrix}
  {} & {} \\
  {} & {}
\end{pmatrix}`, 'Ma trận tròn', 'systems-and-matrices'),
    groupArgument('bare-matrix', String.raw`\begin{matrix}
  {} & {} \\
  {} & {}
\end{matrix}`, 'Ma trận không ngoặc', 'systems-and-matrices', ['matrix without brackets']),
    groupArgument('determinant', String.raw`\begin{vmatrix}
  {} & {} \\
  {} & {}
\end{vmatrix}`, 'Định thức', 'systems-and-matrices', ['định thức']),
    argument('aligned', String.raw`\begin{aligned}
  {} &= {} \\
  {} &= {}
\end{aligned}`, 'Căn chỉnh nhiều dòng', 'systems-and-matrices', [], ['căn chỉnh', 'hệ phương trình']),
    argument('gathered', String.raw`\begin{gathered}
  {} \\
  {}
\end{gathered}`, 'Căn giữa nhiều dòng', 'systems-and-matrices', []),
    argument('substack', String.raw`\substack{ \\
 }`, 'Nhiều dòng dưới toán tử', 'layout', [
      { from: 10, to: 10 }, { from: 13, to: 13 },
    ], ['nhiều dòng']),
    wrapped('boxed', String.raw`\boxed{${SELECTION_MARKER}}`, 'Đóng khung công thức', 'layout', ['khung']),
    wrapped('overbrace', String.raw`\overbrace{${SELECTION_MARKER}}^{}`, 'Ngoặc trên có chú thích', 'layout', ['ngoặc trên']),
    wrapped('underbrace', String.raw`\underbrace{${SELECTION_MARKER}}_{}`, 'Ngoặc dưới có chú thích', 'layout', ['ngoặc dưới']),
    wrapped('overset', String.raw`\overset{}{${SELECTION_MARKER}}`, 'Đặt chữ phía trên', 'layout', ['trên']),
    wrapped('underset', String.raw`\underset{}{${SELECTION_MARKER}}`, 'Đặt chữ phía dưới', 'layout', ['dưới']),
    wrapped('widehat', String.raw`\widehat{${SELECTION_MARKER}}`, 'Mũ rộng', 'layout', ['mũ rộng']),
    wrapped('widetilde', String.raw`\widetilde{${SELECTION_MARKER}}`, 'Ngã rộng', 'layout', ['ngã rộng']),
    wrapped('overline', String.raw`\overline{${SELECTION_MARKER}}`, 'Gạch trên', 'layout', ['gạch trên']),
    wrapped('underline', String.raw`\underline{${SELECTION_MARKER}}`, 'Gạch dưới', 'layout', ['gạch dưới']),
    wrapped('mathbb', String.raw`\mathbb{${SELECTION_MARKER}}`, 'Chữ double-struck', 'symbols', ['tập số']),
    wrapped('mathcal', String.raw`\mathcal{${SELECTION_MARKER}}`, 'Chữ calligraphic', 'symbols', ['calligraphic']),
    wrapped('mathfrak', String.raw`\mathfrak{${SELECTION_MARKER}}`, 'Chữ Fraktur', 'symbols', ['fraktur']),
    wrapped('mathscr', String.raw`\mathscr{${SELECTION_MARKER}}`, 'Chữ Script', 'symbols', ['script']),
    wrapped('mathbf', String.raw`\mathbf{${SELECTION_MARKER}}`, 'Chữ đậm toán học', 'symbols', ['đậm']),
    wrapped('mathrm', String.raw`\mathrm{${SELECTION_MARKER}}`, 'Chữ đứng toán học', 'symbols', ['roman']),
    simple('operator-rank', String.raw`\operatorname{rank}`, 'Toán tử rank', 'symbols', ['rank']),
    simple('operator-Var', String.raw`\operatorname{Var}`, 'Toán tử phương sai', 'symbols', ['phương sai']),
    simple('arrow-long-right', String.raw`\longrightarrow`, 'Mũi tên dài sang phải', 'symbols', ['mũi tên']),
    simple('arrow-long-left', String.raw`\longleftarrow`, 'Mũi tên dài sang trái', 'symbols', ['mũi tên trái']),
    simple('arrow-long-double', String.raw`\longleftrightarrow`, 'Mũi tên dài hai chiều', 'symbols', ['hai chiều']),
    simple('arrow-long-mapsto', String.raw`\longmapsto`, 'Ánh xạ dài', 'symbols', ['ánh xạ']),
    simple('arrow-implies', String.raw`\implies`, 'Suy ra', 'relations', ['suy ra']),
    simple('arrow-iff', String.raw`\iff`, 'Tương đương logic', 'relations', ['tương đương logic']),
    simple('logic-forall', String.raw`\forall`, 'Với mọi', 'symbols', ['với mọi']),
    simple('logic-exists', String.raw`\exists`, 'Tồn tại', 'symbols', ['tồn tại']),
    simple('logic-not-exists', String.raw`\nexists`, 'Không tồn tại', 'symbols', ['không tồn tại']),
    simple('set-empty', String.raw`\varnothing`, 'Tập rỗng', 'symbols', ['tập rỗng']),
    simple('set-in', String.raw`\in`, 'Phần tử thuộc tập', 'relations', ['thuộc']),
    simple('set-not-in', String.raw`\notin`, 'Phần tử không thuộc tập', 'relations', ['không thuộc']),
    simple('set-subseteq', String.raw`\subseteq`, 'Tập con hoặc bằng', 'relations', ['tập con']),
    simple('set-supseteq', String.raw`\supseteq`, 'Tập chứa hoặc bằng', 'relations', ['tập chứa']),
    simple('set-union', String.raw`\cup`, 'Hợp', 'symbols', ['hợp']),
    simple('set-intersection', String.raw`\cap`, 'Giao', 'symbols', ['giao']),
    simple('set-difference', String.raw`\setminus`, 'Hiệu tập hợp', 'symbols', ['hiệu']),
  ];

  const greek: Array<[string, string, string]> = [
    ['delta', '\\delta', 'Delta'], ['epsilon', '\\epsilon', 'Epsilon'],
    ['varepsilon', '\\varepsilon', 'Epsilon biến thể'], ['zeta', '\\zeta', 'Zeta'],
    ['eta', '\\eta', 'Eta'], ['theta', '\\theta', 'Theta'], ['vartheta', '\\vartheta', 'Theta biến thể'],
    ['iota', '\\iota', 'Iota'], ['kappa', '\\kappa', 'Kappa'], ['varkappa', '\\varkappa', 'Kappa biến thể'],
    ['lambda', '\\lambda', 'Lambda'], ['mu', '\\mu', 'Mu'], ['nu', '\\nu', 'Nu'],
    ['xi', '\\xi', 'Xi'], ['pi', '\\pi', 'Pi'], ['varpi', '\\varpi', 'Pi biến thể'],
    ['rho', '\\rho', 'Rho'], ['varrho', '\\varrho', 'Rho biến thể'], ['sigma', '\\sigma', 'Sigma'],
    ['varsigma', '\\varsigma', 'Sigma biến thể'], ['tau', '\\tau', 'Tau'], ['upsilon', '\\upsilon', 'Upsilon'],
    ['phi', '\\phi', 'Phi'], ['varphi', '\\varphi', 'Phi biến thể'], ['chi', '\\chi', 'Chi'],
    ['psi', '\\psi', 'Psi'], ['omega', '\\omega', 'Omega'],
  ];
  for (const [id, command, title] of greek) {
    result.push(simple(`greek-${id}`, command, title, 'symbols', [title.toLowerCase()]));
  }

  const commands: Array<[string, string, MathTemplateCategory, string[]]> = [
    ['bigcap', '\\bigcap', 'symbols', ['giao lớn']], ['bigcup', '\\bigcup', 'symbols', ['hợp lớn']],
    ['bigodot', '\\bigodot', 'symbols', []], ['bigoplus', '\\bigoplus', 'symbols', []],
    ['bigotimes', '\\bigotimes', 'symbols', []], ['bigsqcup', '\\bigsqcup', 'symbols', []],
    ['biguplus', '\\biguplus', 'symbols', []], ['bigvee', '\\bigvee', 'symbols', []],
    ['bigwedge', '\\bigwedge', 'symbols', []], ['coprod', '\\coprod', 'symbols', []],
    ['idotsint', '\\int\\cdots\\int', 'calculus', ['idotsint']],
    ['iiiint', '\\int\\!\\int\\!\\int\\!\\int', 'calculus', ['iiiint']],
    ['varlimsup', '\\varlimsup', 'calculus', []], ['varliminf', '\\varliminf', 'calculus', []],
    ['arccos', '\\arccos', 'symbols', []], ['arcsin', '\\arcsin', 'symbols', []],
    ['arctan', '\\arctan', 'symbols', []], ['arg', '\\arg', 'symbols', []],
    ['cos', '\\cos', 'symbols', []], ['cosh', '\\cosh', 'symbols', []],
    ['cot', '\\cot', 'symbols', []], ['coth', '\\coth', 'symbols', []],
    ['csc', '\\csc', 'symbols', []], ['det', '\\det', 'symbols', []],
    ['dim', '\\dim', 'symbols', []], ['exp', '\\exp', 'symbols', []],
    ['gcd', '\\gcd', 'symbols', []], ['hom', '\\hom', 'symbols', []],
    ['inf', '\\inf', 'symbols', []], ['ker', '\\ker', 'symbols', []],
    ['lg', '\\lg', 'symbols', []], ['liminf', '\\liminf', 'calculus', []],
    ['limsup', '\\limsup', 'calculus', []], ['ln', '\\ln', 'symbols', []],
    ['log', '\\log', 'symbols', []], ['max', '\\max', 'symbols', []],
    ['min', '\\min', 'symbols', []], ['Pr', '\\Pr', 'symbols', []],
    ['sec', '\\sec', 'symbols', []], ['sin', '\\sin', 'symbols', []],
    ['sinh', '\\sinh', 'symbols', []], ['sup', '\\sup', 'symbols', []],
    ['tan', '\\tan', 'symbols', []], ['tanh', '\\tanh', 'symbols', []],
    ['pm', '\\pm', 'symbols', ['cộng trừ']], ['mp', '\\mp', 'symbols', []],
    ['times', '\\times', 'symbols', ['nhân']], ['div', '\\div', 'symbols', ['chia']],
    ['cdot', '\\cdot', 'symbols', ['chấm giữa']], ['bullet', '\\bullet', 'symbols', []],
    ['ast', '\\ast', 'symbols', []], ['star', '\\star', 'symbols', []],
    ['dagger', '\\dagger', 'symbols', []], ['ddagger', '\\ddagger', 'symbols', []],
    ['therefore', '\\therefore', 'symbols', ['do đó']], ['because', '\\because', 'symbols', ['vì']],
    ['infty', '\\infty', 'symbols', ['vô cực']], ['partial', '\\partial', 'symbols', ['ký hiệu đạo hàm riêng']],
    ['hbar', '\\hbar', 'symbols', []], ['hslash', '\\hslash', 'symbols', []],
    ['aleph', '\\aleph', 'symbols', []], ['angle', '\\angle', 'symbols', ['góc']],
    ['emptyset', '\\emptyset', 'symbols', ['tập rỗng']], ['surd', '\\surd', 'symbols', []],
    ['perp', '\\perp', 'relations', ['vuông góc']], ['parallel', '\\parallel', 'relations', ['song song']],
    ['approx', '\\approx', 'relations', ['xấp xỉ']], ['equiv', '\\equiv', 'relations', ['đồng nhất']],
    ['cong', '\\cong', 'relations', []], ['sim', '\\sim', 'relations', []],
    ['simeq', '\\simeq', 'relations', []], ['propto', '\\propto', 'relations', []],
    ['vdash', '\\vdash', 'relations', []], ['models', '\\models', 'relations', []],
    ['prec', '\\prec', 'relations', []], ['succ', '\\succ', 'relations', []],
    ['preceq', '\\preceq', 'relations', []], ['succeq', '\\succeq', 'relations', []],
    ['leq', '\\leq', 'relations', ['bé hơn hoặc bằng']], ['geq', '\\geq', 'relations', ['lớn hơn hoặc bằng']],
    ['neq', '\\neq', 'relations', ['khác']], ['nmid', '\\nmid', 'relations', []],
    ['nparallel', '\\nparallel', 'relations', []], ['nsubseteq', '\\nsubseteq', 'relations', []],
    ['nsupseteq', '\\nsupseteq', 'relations', []], ['triangleq', '\\triangleq', 'relations', []],
    ['leftarrow', '\\leftarrow', 'symbols', []], ['rightarrow', '\\rightarrow', 'symbols', []],
    ['Leftarrow', '\\Leftarrow', 'symbols', []], ['Rightarrow', '\\Rightarrow', 'symbols', []],
    ['Leftrightarrow', '\\Leftrightarrow', 'symbols', []], ['leftrightarrow', '\\leftrightarrow', 'symbols', []],
    ['mapsto', '\\mapsto', 'symbols', []], ['hookrightarrow', '\\hookrightarrow', 'symbols', []],
    ['hookleftarrow', '\\hookleftarrow', 'symbols', []], ['nearrow', '\\nearrow', 'symbols', []],
    ['searrow', '\\searrow', 'symbols', []], ['swarrow', '\\swarrow', 'symbols', []],
    ['nwarrow', '\\nwarrow', 'symbols', []], ['uparrow', '\\uparrow', 'symbols', []],
    ['downarrow', '\\downarrow', 'symbols', []], ['updownarrow', '\\updownarrow', 'symbols', []],
  ];
  for (const [id, command, category, aliases] of commands) {
    result.push(simple(id, command, command.slice(1), category, aliases));
  }
  return [
    ...result,
    ...markdownMathReferenceCommands.map(referenceDefinition),
  ];
}

function referenceDefinition(command: string): TemplateDefinition {
  const name = command.slice(1);
  const id = `reference-${name}`;
  const aliases = [name];
  const category: MathTemplateCategory = /^(?:le|ge|eq|neq|prec|succ|subset|supset|sim|approx|cong|parallel|perp|in|notin|vdash|models)/u.test(name)
    ? 'relations'
    : /^(?:int|oint|sum|prod|lim|varlim|projlim|injlim|idotsint|iiiint|iiint|iint)/u.test(name)
      ? 'calculus'
      : /^(?:begin|end|left|right|middle|over|under|wide|vec|math|text|frac|binom|sqrt|sub|sup|stack|operator|pmod|mod)/u.test(name)
        ? 'layout'
        : 'symbols';
  const special = referenceInsertion(command);
  return definition(id, name, aliases, category, () => special);
}

function referenceInsertion(command: string): MathInsertion {
  const name = command.slice(1);
  if (name === 'idotsint') return insertionWithStops(String.raw`\int\cdots\int`, []);
  if (name === 'iiiint') return insertionWithStops(String.raw`\int\!\int\!\int\!\int`, []);
  if (name === 'left' || name === 'right') {
    return wrapInsertion(String.raw`\left(${SELECTION_MARKER}\right)`);
  }
  if (name === 'middle') {
    return insertionWithStops(String.raw`\left( {}\middle| {}\right)`, emptyGroupStops(String.raw`\left( {}\middle| {}\right)`));
  }
  if (name === 'limits') return insertionWithStops(String.raw`\sum\limits`, []);
  if (name === 'nolimits') return insertionWithStops(String.raw`\sum\nolimits`, []);
  if (name === 'not') return insertionWithStops(String.raw`\not=`, []);

  const oneArgument = new Set([
    'acute', 'bar', 'boxed', 'breve', 'check', 'ddddot', 'dddot', 'ddot',
    'dot', 'grave', 'hat', 'mathring', 'overbrace', 'overleftarrow',
    'overleftrightarrow', 'overline', 'overrightarrow', 'sqrt',
    'substack', 'text', 'tilde', 'underbrace', 'underleftarrow',
    'underleftrightarrow', 'underline', 'underrightarrow',
    'vec', 'widehat', 'widetilde', 'xleftarrow', 'xrightarrow',
  ]);
  if (oneArgument.has(name)) {
    return wrapInsertion(`\\${name}{${SELECTION_MARKER}}`);
  }

  const twoArguments = new Set([
    'binom', 'cfrac', 'dbinom', 'dfrac', 'frac', 'tbinom', 'tfrac',
    'overset', 'stackrel', 'underset',
  ]);
  if (twoArguments.has(name)) {
    return insertionWithStops(
      `\\${name}{}{}`,
      [{ from: name.length + 2, to: name.length + 2 }],
    );
  }
  if (name === 'operatorname' || name === 'pmod' || name === 'mod') {
    return wrapInsertion(`\\${name}{${SELECTION_MARKER}}`);
  }
  return insertionWithStops(command, []);
}

function insertionWithStops(text: string, tabStops: MathTabStop[]): MathInsertion {
  return {
    text,
    tabStops,
    activeTabStop: tabStops[0] ?? null,
  };
}

function wrapInsertion(template: string, selectedText?: string): MathInsertion {
  const markerOffset = template.indexOf(SELECTION_MARKER);
  if (markerOffset < 0) throw new Error('Math template is missing its insertion marker.');
  const text = template.replace(SELECTION_MARKER, selectedText ?? '');
  const from = markerOffset;
  const to = from + (selectedText?.length ?? 0);
  const primary = selectedText ? { from: to, to } : { from, to };
  const annotationStops = emptyGroupStops(template)
    .filter((stop) => stop.from !== markerOffset)
    .map((stop) => ({
      from: stop.from > markerOffset ? stop.from - SELECTION_MARKER.length + (selectedText?.length ?? 0) : stop.from,
      to: stop.to > markerOffset ? stop.to - SELECTION_MARKER.length + (selectedText?.length ?? 0) : stop.to,
    }));
  return insertionWithStops(text, [primary, ...annotationStops].sort((left, right) => left.from - right.from));
}

function offsetOf(prefix: string, length: number): MathTabStop {
  const from = prefix.length;
  return { from, to: from + length };
}

function emptyGroupStops(text: string): MathTabStop[] {
  const stops: MathTabStop[] = [];
  for (let index = 0; index < text.length - 1; index += 1) {
    if (text[index] === '{' && text[index + 1] === '}') {
      stops.push({ from: index + 1, to: index + 1 });
      index += 1;
    }
  }
  return stops;
}

function emptyGroupRanges(text: string): MathTabStop[] {
  const stops: MathTabStop[] = [];
  for (let index = 0; index < text.length - 1; index += 1) {
    if (text[index] === '{' && text[index + 1] === '}') {
      stops.push({ from: index, to: index + 2 });
      index += 1;
    }
  }
  return stops;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gu, 'd')
    .replace(/Đ/gu, 'D')
    .toLocaleLowerCase('vi');
}
