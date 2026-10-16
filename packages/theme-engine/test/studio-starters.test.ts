import { describe, expect, it } from 'vitest';
import { createStudioStarterThemes } from '../src/studio-starters.js';
import { compileAuthoredTheme } from '../src/authored-theme.js';

describe('shared academic starter themes', () => {
  it('returns independent, compiler-supported themes with reusable metadata bindings', () => {
    const themes = createStudioStarterThemes();
    expect(themes).toHaveLength(2);
    expect(new Set(themes.map(theme => theme.id)).size).toBe(2);
    for (const theme of themes) {
      const compiled = compileAuthoredTheme(theme, { lmx: { cover: { title: 'Reusable report' } } });
      expect(compiled.errors).toEqual([]);
      expect(compiled.coverLayout?.children.some(child => child.node.properties.text === 'Reusable report')).toBe(true);
      expect(JSON.stringify(theme)).not.toMatch(/HCMUT|hcmut\.png|BÁCH KHOA/);
    }
    themes[0]!.scene.root.style.color = '#FF0000';
    expect(createStudioStarterThemes()[0]!.scene.root.style.color).not.toBe('#FF0000');
  });
});
