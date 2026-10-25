export interface LmxAttributeDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
}

export interface LmxDefinition {
  name: string;
  title: string;
  category: 'layout' | 'structure' | 'theorem' | 'media' | 'front-matter' | 'style';
  attributes: LmxAttributeDefinition[];
  template: string;
  transparent?: boolean;
}

export interface LmxInsertCommand {
  id: string;
  title: string;
  template: string;
}

const definitions: LmxDefinition[] = [
  definition('theme-layout', 'Authored Section', 'layout', [stringAttribute('node', true)], ':::theme-layout {node="section-id"}\n:::\n'),
  definition('cover', 'Trang bìa', 'structure', [], ':::cover\n:::\n'),
  definition('toc', 'Mục lục', 'structure', [], ':::toc\n:::\n'),
  definition(
    'list-of-figures',
    'Danh sách hình',
    'structure',
    [],
    ':::list-of-figures\n:::\n',
  ),
  definition(
    'list-of-tables',
    'Danh sách bảng',
    'structure',
    [],
    ':::list-of-tables\n:::\n',
  ),
  definition(
    'references',
    'Tài liệu tham khảo',
    'structure',
    [stringAttribute('style'), stringAttribute('title')],
    ':::references\n:::\n',
  ),
  definition('pagebreak', 'Page Break', 'layout', [], ':::pagebreak\n:::\n'),
  theorem('theorem', 'Định lý', 'thm-label'),
  theorem('definition', 'Định nghĩa', 'def-label'),
  definition(
    'proof',
    'Chứng minh',
    'theorem',
    [stringAttribute('title')],
    ':::proof\nNội dung chứng minh.\n:::\n',
  ),
  theorem('remark', 'Nhận xét', 'rem-label'),
  theorem('property', 'Tính chất', 'property-label'),
  theorem('proposition', 'Mệnh đề', 'proposition-label'),
  theorem('corollary', 'Hệ quả', 'corollary-label'),
  theorem('lemma', 'Bổ đề', 'lemma-label'),
  theorem('exercise', 'Bài toán', 'exercise-label'),
  definition(
    'figure',
    'Figure',
    'media',
    [stringAttribute('caption', true), numberAttribute('width'), stringAttribute('placement')],
    ':::figure {#fig-label caption="Chú thích hình" width=0.8 placement="h!"}\n![Chú thích hình](assets/image.png)\n:::\n',
  ),
  definition(
    'table',
    'Table',
    'media',
    [stringAttribute('caption', true), stringAttribute('placement')],
    ':::table {#tbl-label caption="Chú thích bảng" placement="h!"}\n| Cột 1 | Cột 2 |\n| --- | --- |\n| Giá trị | Giá trị |\n:::\n',
  ),
  definition(
    'equation',
    'Phương trình',
    'media',
    [stringAttribute('title')],
    ':::equation {#eq-label}\n$$\nf(x) = \\int_0^x g(t)\\,dt\n$$\n:::\n',
  ),
  definition(
    'algorithm',
    'Thuật toán',
    'media',
    [stringAttribute('caption'), stringAttribute('title')],
    ':::algorithm {#alg-label caption="Tên thuật toán"}\n1. **Input:** Dữ liệu đầu vào\n2. **Output:** Kết quả đầu ra\n3. Thực hiện các bước xử lý.\n:::\n',
  ),
  definition(
    'listing',
    'Code Listing',
    'media',
    [stringAttribute('caption'), stringAttribute('language'), booleanAttribute('lineNumbers')],
    ':::listing {#lst-label caption="Chú thích mã" language="text" lineNumbers=true}\n```text\ncode\n```\n:::\n',
  ),
  definition(
    'front-section',
    'Front Section',
    'front-matter',
    [stringAttribute('kind', true), stringAttribute('title'), booleanAttribute('numbered')],
    ':::front-section {kind="abstract" title="Tóm tắt" numbered=false}\nNội dung tóm tắt.\n:::\n',
  ),
  definition(
    'appendix',
    'Phụ lục',
    'front-matter',
    [stringAttribute('title')],
    ':::appendix {title="Phụ lục A"}\nNội dung phụ lục.\n:::\n',
  ),
  {
    ...definition(
      'style',
      'Quick Style',
      'style',
      [
        stringAttribute('component'),
        stringAttribute('theme'),
        stringAttribute('color'),
        stringAttribute('background'),
        numberAttribute('fontSizePt'),
        numberAttribute('lineHeight'),
        stringAttribute('align'),
      ],
      ':::style {component="paragraph"}\nNội dung.\n:::\n',
    ),
    transparent: true,
  },
];

export function listLmxDefinitions(): readonly LmxDefinition[] {
  return definitions;
}

export function getLmxDefinition(name: string): LmxDefinition | undefined {
  return definitions.find((item) => item.name === name);
}

export function listLmxInsertCommands(): readonly LmxInsertCommand[] {
  const command = (id: string, name = id): LmxInsertCommand => {
    const definition = getLmxDefinition(name);
    if (!definition) throw new Error(`Missing LMX definition for ${name}.`);
    return { id, title: definition.title, template: definition.template };
  };
  const frontSection = (id: string, title: string, body: string): LmxInsertCommand => ({
    id,
    title,
    template: `:::front-section {kind="${id}" title="${title}" numbered=false}\n${body}\n:::\n`,
  });

  return [
    command('cover'),
    command('toc'),
    command('list-of-figures'),
    command('list-of-tables'),
    command('references'),
    command('figure'),
    command('table'),
    command('equation'),
    command('algorithm'),
    command('listing'),
    command('theorem'),
    command('definition'),
    command('proof'),
    command('remark'),
    command('property'),
    command('proposition'),
    command('corollary'),
    command('lemma'),
    command('exercise'),
    command('pagebreak'),
    frontSection('acknowledgements', 'Lời cảm ơn', 'Nội dung lời cảm ơn.'),
    frontSection('declaration', 'Lời cam đoan', 'Nội dung lời cam đoan.'),
    frontSection('abstract', 'Tóm tắt', 'Nội dung tóm tắt.'),
    command('appendix'),
  ];
}

export function getLmxInsertCommand(id: string): LmxInsertCommand | undefined {
  return listLmxInsertCommands().find((command) => command.id === id);
}

function theorem(name: string, title: string, label: string): LmxDefinition {
  return definition(
    name,
    title,
    'theorem',
    [stringAttribute('title')],
    `:::${name} {#${label}}\nNội dung.\n:::\n`,
  );
}

function definition(
  name: string,
  title: string,
  category: LmxDefinition['category'],
  attributes: LmxAttributeDefinition[],
  template: string,
): LmxDefinition {
  return { name, title, category, attributes, template };
}

function stringAttribute(name: string, required = false): LmxAttributeDefinition {
  return { name, type: 'string', required };
}

function numberAttribute(name: string, required = false): LmxAttributeDefinition {
  return { name, type: 'number', required };
}

function booleanAttribute(name: string, required = false): LmxAttributeDefinition {
  return { name, type: 'boolean', required };
}
