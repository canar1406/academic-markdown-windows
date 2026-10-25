import {
  CodeBlockLanguageSelector,
  EmojiSelector,
  FootnoteTool,
  ImageEditTool,
  ImageResizeBar,
  ImageToolBar,
  InlineFormatToolbar,
  LinkTools,
  Muya,
  ParagraphFrontButton,
  ParagraphFrontMenu,
  ParagraphQuickInsertMenu,
  PreviewToolBar,
  TableColumnToolbar,
  TablePicker,
  TableDragBar,
  TableRowColumMenu,
} from '@markdown/muya-core';
import { listLmxInsertCommands } from '@markdown/document-core';
import { registerPluginSet } from './plugin-registration.js';
import { MathContextMenu } from './math-context-menu.js';
import { BlockSelectAll } from './block-select-all.js';

type QuickInsertItem = ParagraphQuickInsertMenu['renderData'][number]['children'][number];

export interface AcademicQuickInsertOptions {
  insertCommand(commandId: string, triggerText: string, topLevelIndex: number | null): void;
}

const academicIcon = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Cpath fill="%235d625f" d="M5 3h10l4 4v14H5zm9 1.5V8h3.5zM8 12h8v1.5H8zm0 3h8v1.5H8z"/%3E%3C/svg%3E';

const standardSlashAliases: QuickInsertItem[] = [
  ...[1, 2, 3, 4].map((level) => ({
    title: `Heading ${level}`,
    subTitle: `${'#'.repeat(level)} Heading ${level}`,
    label: `atx-heading ${level}`,
    icon: academicIcon,
    shortCut: `/heading${level}`,
  })),
  {
    title: 'Equation',
    subTitle: '$$ equation $$',
    label: 'math-block',
    icon: academicIcon,
    shortCut: '/equation',
  },
];

export class AcademicQuickInsertMenu extends ParagraphQuickInsertMenu {
  static override pluginName = 'quickInsert';

  constructor(
    muya: Muya,
    private readonly academicOptions: AcademicQuickInsertOptions,
  ) {
    super(muya);
  }

  override search(text: string): void {
    super.search(text);
    const query = text.trim().toLocaleLowerCase('vi');
    const aliasItems = standardSlashAliases.filter((item) => (
      query.length === 0
      || `${item.shortCut?.slice(1) ?? ''} ${item.title}`.toLocaleLowerCase('vi').includes(query)
    ));
    const academicItems: QuickInsertItem[] = listLmxInsertCommands()
      .filter((command) => {
        if (query.length === 0) return true;
        return `${command.id} ${command.title}`.toLocaleLowerCase('vi').includes(query);
      })
      .map((command) => ({
        title: command.title,
        subTitle: command.template.split('\n', 1)[0] ?? command.id,
        label: `lmx:${command.id}`,
        icon: academicIcon,
        shortCut: `/${command.id}`,
      }));

    if (aliasItems.length > 0 || academicItems.length > 0) {
      this.renderData = [
        ...this.renderData,
        ...(aliasItems.length > 0 ? [{ name: 'document blocks', children: aliasItems }] : []),
        { name: 'academic blocks', children: academicItems },
      ].filter((section) => section.children.length > 0);
      this.render();
      if (this.activeItem) {
        const activeEle = this.getItemElement(this.activeItem);
        this.activeEleScrollIntoView(activeEle);
      }
    }
  }

  override selectItem(item: QuickInsertItem): void {
    if (!item.label.startsWith('lmx:')) {
      super.selectItem(item);
      return;
    }

    const paragraph = this.block?.parent ?? null;
    const scrollPage = paragraph?.parent ?? null;
    const topLevelIndex = paragraph && scrollPage?.blockName === 'scrollpage'
      ? scrollPage.offset(paragraph)
      : null;
    this.academicOptions.insertCommand(
      item.label.slice(4),
      this.block?.text ?? '',
      topLevelIndex,
    );
    setTimeout(this.hide.bind(this));
  }
}

export function registerMarkTextPlugins(options: AcademicQuickInsertOptions): void {
  registerPluginSet(Muya.use.bind(Muya), [
    EmojiSelector,
    FootnoteTool,
    InlineFormatToolbar,
    ImageEditTool,
    ImageToolBar,
    ImageResizeBar,
    CodeBlockLanguageSelector,
    LinkTools,
    ParagraphFrontButton,
    ParagraphFrontMenu,
    TablePicker,
    TableColumnToolbar,
  ]);
  Muya.use(AcademicQuickInsertMenu, options);
  Muya.use(MathContextMenu);
  Muya.use(BlockSelectAll);
  registerPluginSet(Muya.use.bind(Muya), [
    TableDragBar,
    TableRowColumMenu,
    PreviewToolBar,
  ]);
}
