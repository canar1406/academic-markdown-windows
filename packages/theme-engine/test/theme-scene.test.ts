import { describe, expect, it } from 'vitest';
import {
  applyThemeSceneOperation,
  applyThemeSelection,
  resolveThemeForBlock,
  validateThemeScene,
  type ThemeSceneV2,
  type ThemeSelectionSchema,
} from '../src/index.js';

const scene: ThemeSceneV2 = {
  schemaVersion: 2,
  page: { size: 'A4', widthMm: 210, heightMm: 297 },
  tokens: {
    'color.ink': { type: 'color', value: '#202124' },
    'space.body': { type: 'length', value: 12, unit: 'mm' },
  },
  variants: {},
  bindings: [{ key: 'document.title', valueType: 'string' }],
  root: {
    id: 'page',
    widget: 'page',
    version: 1,
    properties: {},
    style: { color: { token: 'color.ink' } },
    children: [{
      id: 'cover',
      widget: 'cover',
      version: 1,
      slot: 'cover',
      properties: {},
      style: {},
      children: [],
    }],
  },
};

describe('theme scene v2', () => {
  it('accepts a deterministic A4 component scene', () => {
    expect(validateThemeScene(scene)).toEqual({ valid: true, errors: [] });
  });

  it('rejects duplicate node IDs and unresolved token references', () => {
    const invalid: ThemeSceneV2 = {
      ...scene,
      root: {
        ...scene.root,
        style: { color: { token: 'color.missing' } },
        children: [{ ...scene.root.children[0]!, id: 'page' }],
      },
    };

    expect(validateThemeScene(invalid).errors).toEqual([
      'Theme scene node IDs must be unique: page.',
      'Theme token reference is unresolved: color.missing.',
    ]);
  });

  it('moves a component through one immutable deterministic operation', () => {
    const withHeader = applyThemeSceneOperation(scene, {
      type: 'insert',
      parentId: 'page',
      index: 1,
      node: {
        id: 'header', widget: 'header', version: 1, slot: 'header',
        properties: {}, style: {}, children: [],
      },
    });
    const moved = applyThemeSceneOperation(withHeader, {
      type: 'move',
      nodeId: 'header',
      parentId: 'page',
      index: 0,
    });

    expect(scene.root.children.map((node) => node.id)).toEqual(['cover']);
    expect(moved.root.children.map((node) => node.id)).toEqual(['header', 'cover']);
    expect(validateThemeScene(moved).valid).toBe(true);
  });

  it('rejects inserting into a missing parent without mutating the scene', () => {
    expect(() => applyThemeSceneOperation(scene, {
      type: 'insert',
      parentId: 'missing',
      index: 0,
      node: {
        id: 'paragraph', widget: 'paragraph', version: 1,
        properties: {}, style: {}, children: [],
      },
    })).toThrow('Theme scene parent was not found: missing');
    expect(scene.root.children.map((node) => node.id)).toEqual(['cover']);
  });

  it('removes a component without mutating the source scene', () => {
    const withHeader = applyThemeSceneOperation(scene, {
      type: 'insert',
      parentId: 'page',
      index: 1,
      node: {
        id: 'header', widget: 'header', version: 1,
        properties: {}, style: {}, children: [],
      },
    });

    const removed = applyThemeSceneOperation(withHeader, {
      type: 'remove',
      nodeId: 'header',
    });

    expect(withHeader.root.children.map((node) => node.id)).toEqual(['cover', 'header']);
    expect(removed.root.children.map((node) => node.id)).toEqual(['cover']);
  });

  it('updates a node patch while preserving unknown fields and unrelated values', () => {
    const node = {
      ...scene.root.children[0]!,
      properties: { title: 'Cover', keep: true },
      style: { accent: '#123456' },
      custom: { future: ['value'] },
    };
    const source = { ...scene, root: { ...scene.root, children: [node] } };

    const updated = applyThemeSceneOperation(source, {
      type: 'update',
      nodeId: 'cover',
      patch: {
        widget: 'title-page',
        properties: { title: 'Updated cover' },
      },
    });

    expect(updated.root.children[0]).toEqual({
      ...node,
      widget: 'title-page',
      properties: { title: 'Updated cover', keep: true },
    });
    expect(source.root.children[0]).toEqual(node);
  });

  it('reorders selected siblings deterministically using source indices and destination', () => {
    const source = {
      ...scene,
      root: {
        ...scene.root,
        children: [
          scene.root.children[0]!,
          { id: 'header', widget: 'header', version: 1, properties: {}, style: {}, children: [] },
          { id: 'footer', widget: 'footer', version: 1, properties: {}, style: {}, children: [] },
        ],
      },
    };

    const reordered = applyThemeSceneOperation(source, {
      type: 'reorder',
      parentId: 'page',
      sourceIndices: [0, 2],
      destination: 3,
    });

    expect(source.root.children.map((node) => node.id)).toEqual(['cover', 'header', 'footer']);
    expect(reordered.root.children.map((node) => node.id)).toEqual(['header', 'cover', 'footer']);
  });

  it('rejects a duplicate ID anywhere in an inserted subtree', () => {
    expect(() => applyThemeSceneOperation(scene, {
      type: 'insert',
      parentId: 'page',
      index: 0,
      node: {
        id: 'new-wrapper',
        widget: 'stack',
        version: 1,
        properties: {},
        style: {},
        children: [{ id: 'cover', widget: 'cover', version: 1, properties: {}, style: {}, children: [] }],
      },
    })).toThrow('Theme scene node IDs must be unique: cover.');
    expect(scene.root.children.map((node) => node.id)).toEqual(['cover']);
  });

  it('rejects moving the root into its own descendant before changing the scene', () => {
    const nested = {
      ...scene,
      root: {
        ...scene.root,
        children: [{
          ...scene.root.children[0]!,
          children: [{ id: 'caption', widget: 'text', version: 1, properties: {}, style: {}, children: [] }],
        }],
      },
    };

    expect(() => applyThemeSceneOperation(nested, {
      type: 'move',
      nodeId: 'cover',
      parentId: 'caption',
      index: 0,
    })).toThrow('Theme scene node cannot be moved into its own descendant.');
    expect(nested.root.children[0]!.children.map((node) => node.id)).toEqual(['caption']);
  });
});

describe('per-block theme selection', () => {
  const selection: ThemeSelectionSchema = {
    schemaVersion: 2,
    themes: {
      base: { id: 'academic-report', version: '1.0.0' },
      math: { id: 'math-theorem', version: '2.0.0', integrity: 'sha256-math' },
      formal: { id: 'formal-cover', version: '1.1.0' },
      unified: { id: 'unified-theme', version: '3.0.0' },
    },
    theme: {
      default: 'base',
      components: { theorem: 'math' },
    },
  };

  it('resolves instance, component, then document aliases with provenance', () => {
    expect(resolveThemeForBlock(selection, {
      componentSlot: 'theorem',
      themeAlias: 'formal',
    })).toEqual({
      alias: 'formal',
      theme: { id: 'formal-cover', version: '1.1.0' },
      source: 'instance',
      diagnostics: [],
    });
    expect(resolveThemeForBlock(selection, { componentSlot: 'theorem' }).source).toBe('component');
    expect(resolveThemeForBlock(selection, { componentSlot: 'paragraph' }).source).toBe('default');
  });

  it('reports a missing alias and uses only the explicit safe fallback', () => {
    expect(resolveThemeForBlock(
      selection,
      { componentSlot: 'theorem', themeAlias: 'missing' },
      { id: 'safe-built-in', version: '1.0.0' },
    )).toEqual({
      theme: { id: 'safe-built-in', version: '1.0.0' },
      source: 'fallback',
      diagnostics: ['Theme alias is not declared: missing.'],
    });
  });

  it('applies to all blocks in one component slot while instance overrides keep precedence', () => {
    const updated = applyThemeSelection(selection, {
      scope: 'all',
      componentSlot: 'theorem',
      themeAlias: 'unified',
    });

    expect(updated.theme).toEqual({
      default: 'base',
      components: { theorem: 'unified' },
    });
    expect(resolveThemeForBlock(updated, {
      componentSlot: 'theorem',
      themeAlias: 'math',
    }).alias).toBe('math');
    expect(selection.theme.components.theorem).toBe('math');
  });
});
