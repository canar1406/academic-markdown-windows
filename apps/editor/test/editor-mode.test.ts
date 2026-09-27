import { describe, expect, it } from 'vitest';
import { EditorModeController } from '../src/editor-mode';

describe('editor visual/source modes', () => {
  it.each([
    '---\nlmx: [broken\n---\n\n# Bản gốc tiếng Việt\n',
    ':::figure {#fig-a}\n![Hình](a.png)\n',
  ])('opens malformed source in recovery mode without feeding it through Muya', (markdown) => {
    const visual = new TestVisualEditor('# Bản trước');
    const source = new TestSourceEditor();
    const controller = new EditorModeController(visual, source);

    controller.loadMarkdown(markdown);

    expect(controller.mode).toBe('source');
    expect(controller.getMarkdown()).toBe(markdown);
    expect(visual.setContentCalls).toEqual([]);
  });

  it('copies the exact visual Markdown into source mode', () => {
    const visual = new TestVisualEditor('# Báo cáo\n\nNội dung');
    const source = new TestSourceEditor();
    const controller = new EditorModeController(visual, source);

    const result = controller.showSource();

    expect(result.ok).toBe(true);
    expect(controller.mode).toBe('source');
    expect(source.value).toBe('# Báo cáo\n\nNội dung');
  });

  it('keeps malformed source intact instead of replacing the visual document', () => {
    const visual = new TestVisualEditor('# Bản an toàn');
    const source = new TestSourceEditor();
    const controller = new EditorModeController(visual, source);
    controller.showSource();
    source.value = '---\ndocument: [broken\n---\n\n# Không được mất';

    const result = controller.showVisual();

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('front-matter.invalid-yaml');
    expect(controller.mode).toBe('source');
    expect(source.value).toContain('# Không được mất');
    expect(visual.setContentCalls).toEqual([]);
  });

  it('applies validated source to the visual editor without rewriting it', () => {
    const visual = new TestVisualEditor('# Cũ');
    const source = new TestSourceEditor();
    const controller = new EditorModeController(visual, source);
    controller.showSource();
    const updated = '---\ndocument:\n  title: Đồ án\n---\n\n# Mới\n';
    source.value = updated;

    const result = controller.showVisual();

    expect(result.ok).toBe(true);
    expect(controller.mode).toBe('visual');
    expect(visual.setContentCalls).toEqual([updated]);
  });

  it('keeps malformed LMX source recoverable', () => {
    const visual = new TestVisualEditor('# Cũ');
    const source = new TestSourceEditor();
    const controller = new EditorModeController(visual, source);
    controller.showSource();
    source.value = ':::figure {#fig-a}\n![Hình](a.png)\n';

    const result = controller.showVisual();

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('lmx.unterminated-directive');
    expect(controller.mode).toBe('source');
    expect(visual.setContentCalls).toEqual([]);
  });
});

class TestVisualEditor {
  readonly setContentCalls: string[] = [];

  constructor(private markdown: string) {}

  getMarkdown(): string { return this.markdown; }

  setContent(markdown: string): void {
    this.markdown = markdown;
    this.setContentCalls.push(markdown);
  }
}

class TestSourceEditor {
  value = '';

  getValue(): string { return this.value; }
  setValue(value: string): void { this.value = value; }
}
