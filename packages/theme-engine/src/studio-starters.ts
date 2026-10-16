import type { AuthoredThemeSnapshot } from './authored-theme.js';
import type { ThemeSceneNode } from './index.js';

/** Original, portable academic presets; no third-party artwork or template code. */
export function createStudioStarterThemes(): AuthoredThemeSnapshot[] {
  return ['classic', 'compact'].map(variant => {
    const compact = variant === 'compact';
    const node = (
      id: string, widget: string,
      properties: ThemeSceneNode['properties'] = {},
      style: ThemeSceneNode['style'] = {},
      children: ThemeSceneNode[] = [],
      bindings?: Record<string, string>,
    ): ThemeSceneNode => ({ id, widget, version: 1, properties, style, children, ...(bindings ? { bindings } : {}) });
    return {
      schemaVersion: 1, id: `academic-${variant}`, version: '1.0.0',
      name: compact ? 'Academic Compact' : 'Academic Classic',
      scene: {
        schemaVersion: 2, page: { size: 'A4', widthMm: 210, heightMm: 297 },
        tokens: {
          'color.ink': { type: 'color', value: '#20332B' },
          'color.accent': { type: 'color', value: compact ? '#9A482F' : '#24604B' },
          'font.body': { type: 'font-family', value: 'serif' },
          'size.body': { type: 'length', value: compact ? 10 : 11, unit: 'pt' },
        },
        variants: {},
        bindings: ['document.title', 'cover.university', 'cover.supervisor', 'cover.students',
          'header.institution', 'footer.left'].map(key => ({ key, valueType: 'string' as const })),
        root: node('page', 'page', {}, {
          color: { token: 'color.ink' }, fontFamily: { token: 'font.body' },
          fontSizePt: { token: 'size.body' }, lineHeight: compact ? 1.2 : 1.4,
        }, [
          node('cover', 'cover', { title: 'Cover', gapMm: compact ? 8 : 12, alignment: 'center' }, {}, [
            node('university', 'text', { text: 'UNIVERSITY', alignment: 'center' }, { fontSizePt: 14 }, [], { text: 'cover.university' }),
            node('report-title', 'text', { text: 'Academic report', alignment: 'center' },
              { fontSizePt: 24, fontWeight: 'bold', color: { token: 'color.accent' } }, [], { text: 'document.title' }),
            node('supervisor', 'text', { text: 'Supervisor', alignment: 'center' }, {}, [], { text: 'cover.supervisor' }),
            node('authors', 'text', { text: 'Student name (ID)', alignment: 'center' }, {}, [], { text: 'cover.students' }),
          ]),
          node('header', 'header', { text: 'Academic report', alignment: 'leading' },
            { fontSizePt: 9 }, [], { text: 'header.institution' }),
          node('heading', 'heading', { level: 1, text: 'Introduction', alignment: 'leading' },
            { fontSizePt: compact ? 14 : 16, fontWeight: 'bold', color: { token: 'color.accent' } }),
          node('paragraph', 'paragraph', {
            text: 'Write your report in Markdown. This sample demonstrates the reusable body typography.',
            alignment: 'leading',
          }),
          node('theorem', 'theorem', { title: 'Example', text: 'Academic content follows the document flow.' }),
          node('footer', 'footer', { left: 'Academic report', alignment: 'leading' },
            { fontSizePt: 8 }, [], { left: 'footer.left' }),
          node('page-number', 'page-number', { format: 'current-total' }),
        ]),
      },
    };
  });
}
